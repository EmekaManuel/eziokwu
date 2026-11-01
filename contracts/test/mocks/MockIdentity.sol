// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IIdentity} from "../../src/interfaces/IIdentity.sol";

/// @dev Test double for GoodDollar Identity. Mirrors getWhitelistedRoot semantics only.
contract MockIdentity is IIdentity {
    mapping(address => address) public roots;

    /// @dev Set `account`'s root. A root maps to itself; a connected wallet maps to its root.
    function setRoot(address account, address root) external {
        roots[account] = root;
    }

    function getWhitelistedRoot(address account) external view returns (address) {
        return roots[account];
    }
}
