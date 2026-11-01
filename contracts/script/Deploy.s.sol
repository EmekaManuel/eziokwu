// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BountyBoard} from "../src/BountyBoard.sol";
import {MockGD} from "../test/mocks/MockGD.sol";
import {MockIdentity} from "../test/mocks/MockIdentity.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @notice Deploys BountyBoard, parameterised by environment variables (see ../.env.example).
///
/// DEPLOY_ENV = dev    Celo mainnet (42220) + GoodDollar DEVELOPMENT G$ and Identity (for testing)
///              prod   Celo mainnet (42220) + GoodDollar PRODUCTION G$ and Identity
///              local  any other chain (e.g. anvil): deploys mock G$ and Identity first
///
/// Without `--broadcast` forge only SIMULATES. The deployer key is passed on the command line
/// (`--account <keystore>` preferred, or `--private-key`), never read from a file by this script.
contract Deploy is Script {
    uint256 internal constant CELO_CHAIN_ID = 42220;

    // Verified against docs.gooddollar.org (Stage 1).
    address internal constant GD_PROD = 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A;
    address internal constant IDENTITY_PROD = 0xC361A6E67822a0EDc17D899227dd9FC50BD62F42;
    address internal constant GD_DEV = 0xFa51eFDc0910CCdA91732e6806912Fa12e2FD475;
    address internal constant IDENTITY_DEV = 0xF25fA0D4896271228193E782831F6f3CFCcF169C;

    /// @notice Entry point for `forge script`: reads the configuration from the environment.
    function run() external returns (BountyBoard) {
        uint256 feeBps = vm.envUint("FEE_BPS");
        require(feeBps <= 500, "FEE_BPS > 500");
        return deploy(
            vm.envString("DEPLOY_ENV"),
            vm.envAddress("OWNER"),
            vm.envAddress("VERIFIER"),
            vm.envAddress("FEE_RECIPIENT"),
            uint16(feeBps)
        );
    }

    /// @notice Deploys with explicit parameters (also used by the tests, which avoid process-wide env).
    function deploy(string memory envName, address owner, address verifier, address feeRecipient, uint16 feeBps)
        public
        returns (BountyBoard board)
    {
        bytes32 env = keccak256(bytes(envName));

        require(owner != address(0), "OWNER unset");
        require(feeRecipient != address(0), "FEE_RECIPIENT unset");
        require(feeBps <= 500, "FEE_BPS > 500");

        address gd;
        address identity;

        if (env == keccak256("local")) {
            require(block.chainid != CELO_CHAIN_ID, "local env on Celo mainnet");
            vm.startBroadcast();
            gd = address(new MockGD());
            identity = address(new MockIdentity());
        } else {
            require(block.chainid == CELO_CHAIN_ID, "not Celo mainnet (42220)");
            if (env == keccak256("prod")) {
                (gd, identity) = (GD_PROD, IDENTITY_PROD);
            } else if (env == keccak256("dev")) {
                (gd, identity) = (GD_DEV, IDENTITY_DEV);
            } else {
                revert("DEPLOY_ENV must be dev, prod or local");
            }
            _sanityCheckDependencies(gd, identity);
            vm.startBroadcast();
        }

        board = new BountyBoard(gd, identity, owner, verifier, feeRecipient, feeBps);
        vm.stopBroadcast();

        // Post-deploy self-check against the config we intended.
        require(address(board.gd()) == gd, "gd mismatch");
        require(address(board.identity()) == identity, "identity mismatch");
        require(board.owner() == owner, "owner mismatch");
        require(board.verifier() == verifier, "verifier mismatch");
        require(board.feeRecipient() == feeRecipient, "feeRecipient mismatch");
        require(board.feeBps() == feeBps, "feeBps mismatch");

        console.log("DEPLOY_ENV    ", envName);
        console.log("BountyBoard   ", address(board));
        console.log("G$            ", gd);
        console.log("Identity      ", identity);
        console.log("owner         ", owner);
        console.log("verifier      ", verifier);
        console.log("feeRecipient  ", feeRecipient);
        console.log("feeBps        ", feeBps);
    }

    /// @dev Refuse to deploy against addresses that are not live G$ / Identity contracts.
    function _sanityCheckDependencies(address gd, address identity) internal view {
        require(gd.code.length > 0, "G$ has no code on this chain");
        require(identity.code.length > 0, "Identity has no code on this chain");
        require(IERC20Decimals(gd).decimals() == 18, "G$ decimals != 18");
        // Reverts if the Identity contract lacks getWhitelistedRoot.
        (bool ok,) = identity.staticcall(abi.encodeWithSignature("getWhitelistedRoot(address)", address(1)));
        require(ok, "Identity.getWhitelistedRoot missing");
    }
}
