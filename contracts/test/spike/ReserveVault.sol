// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

contract ReserveVault {
    error PayFailed();

    receive() external payable {}

    function payOut(address payable to, uint256 amount) external {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PayFailed();
    }

    function payAll(address payable to) external {
        (bool ok,) = to.call{value: address(this).balance}("");
        if (!ok) revert PayFailed();
    }

    function clz(uint256 x) external pure returns (uint256 r) {
        assembly {
            r := clz(x)
        }
    }
}
