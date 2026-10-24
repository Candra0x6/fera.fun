// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract MonsterCoin is ERC20, Initializable {
    error NotArena();
    error ZeroAddress();

    address public arena;
    string private _coinName;
    string private _coinSymbol;

    constructor() ERC20("", "") {
        _disableInitializers();
    }

    function initialize(address arena_, string calldata name_, string calldata symbol_) external initializer {
        if (arena_ == address(0)) revert ZeroAddress();
        arena = arena_;
        _coinName = name_;
        _coinSymbol = symbol_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != arena) revert NotArena();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != arena) revert NotArena();
        _burn(from, amount);
    }

    function name() public view override returns (string memory) {
        return _coinName;
    }

    function symbol() public view override returns (string memory) {
        return _coinSymbol;
    }
}
