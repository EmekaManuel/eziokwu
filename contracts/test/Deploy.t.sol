// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {BountyBoard} from "../src/BountyBoard.sol";
import {MockGD} from "./mocks/MockGD.sol";
import {MockIdentity} from "./mocks/MockIdentity.sol";

contract DeployTest is Test {
    Deploy script;
    address owner = makeAddr("owner");
    address verifier = makeAddr("verifier");
    address ubi = makeAddr("ubi");

    address constant GD_PROD = 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A;
    address constant IDENTITY_PROD = 0xC361A6E67822a0EDc17D899227dd9FC50BD62F42;
    address constant GD_DEV = 0xFa51eFDc0910CCdA91732e6806912Fa12e2FD475;
    address constant IDENTITY_DEV = 0xF25fA0D4896271228193E782831F6f3CFCcF169C;

    function setUp() public {
        script = new Deploy();
    }

    function _etchLiveLookalikes(address gd, address identity) internal {
        vm.etch(gd, address(new MockGD()).code);
        vm.etch(identity, address(new MockIdentity()).code);
    }

    function test_local_deploysMocksAndBoard() public {
        BountyBoard b = script.deploy("local", owner, verifier, ubi, 300);
        assertEq(b.owner(), owner);
        assertEq(b.feeBps(), 300);
        assertTrue(address(b.gd()).code.length > 0);
    }

    function test_dev_usesDevAddresses() public {
        vm.chainId(42220);
        _etchLiveLookalikes(GD_DEV, IDENTITY_DEV);
        BountyBoard b = script.deploy("dev", owner, verifier, ubi, 300);
        assertEq(address(b.gd()), GD_DEV);
        assertEq(address(b.identity()), IDENTITY_DEV);
    }

    function test_prod_usesProdAddresses() public {
        vm.chainId(42220);
        _etchLiveLookalikes(GD_PROD, IDENTITY_PROD);
        BountyBoard b = script.deploy("prod", owner, verifier, ubi, 300);
        assertEq(address(b.gd()), GD_PROD);
        assertEq(address(b.identity()), IDENTITY_PROD);
    }

    function test_prod_revertsOffCelo() public {
        vm.chainId(1);
        vm.expectRevert("not Celo mainnet (42220)");
        script.deploy("prod", owner, verifier, ubi, 300);
    }

    function test_prod_revertsWhenDependenciesHaveNoCode() public {
        vm.chainId(42220);
        vm.expectRevert("G$ has no code on this chain");
        script.deploy("prod", owner, verifier, ubi, 300);
    }

    function test_local_revertsOnCelo() public {
        vm.chainId(42220);
        vm.expectRevert("local env on Celo mainnet");
        script.deploy("local", owner, verifier, ubi, 300);
    }

    function test_unknownEnvReverts() public {
        vm.chainId(42220);
        vm.expectRevert("DEPLOY_ENV must be dev, prod or local");
        script.deploy("staging", owner, verifier, ubi, 300);
    }

    function test_feeAboveCapReverts() public {
        vm.expectRevert("FEE_BPS > 500");
        script.deploy("local", owner, verifier, ubi, 501);
    }

    function test_zeroFeeRecipientReverts() public {
        vm.expectRevert("FEE_RECIPIENT unset");
        script.deploy("local", owner, verifier, address(0), 300);
    }
}
