// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal slice of the GoodDollar Identity contract used by BountyBoard.
interface IIdentity {
    /// @notice Returns the whitelisted (root) address `account` is tied to: the account itself if
    /// whitelisted, the root it is connected to, or address(0) if neither.
    /// @dev Do NOT use `isWhitelisted` for workers; it is false for connected wallets.
    function getWhitelistedRoot(address account) external view returns (address);
}
