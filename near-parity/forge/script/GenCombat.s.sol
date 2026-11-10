// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Script} from "forge-std/Script.sol";
import {CombatHarness} from "../src/CombatHarness.sol";

contract GenCombat is Script {
    string internal constant IN_FILE = "work/combat-in.json";
    string internal constant OUT_FILE = "work/combat-sol.txt";

    function run() external {
        CombatHarness h = new CombatHarness();
        string memory json = vm.readFile(IN_FILE);
        uint256[] memory fns = vm.parseJsonUintArray(json, ".fn");
        uint256[][16] memory cols;
        for (uint256 k = 0; k < 16; ++k) {
            string[] memory s = vm.parseJsonStringArray(json, string.concat(".c", vm.toString(k)));
            cols[k] = new uint256[](s.length);
            for (uint256 i = 0; i < s.length; ++i) {
                cols[k][i] = vm.parseUint(s[i]);
            }
        }
        vm.writeFile(OUT_FILE, "");
        for (uint256 i = 0; i < fns.length; ++i) {
            uint256[16] memory v;
            for (uint256 k = 0; k < 16; ++k) {
                v[k] = cols[k][i];
            }
            vm.writeLine(OUT_FILE, _row(h, fns[i], v));
        }
    }

    function _row(CombatHarness h, uint256 fn, uint256[16] memory v) internal view returns (string memory) {
        try h.run(fn, v) returns (uint256[] memory o) {
            string memory sep = fn == 3 ? "," : "|";
            string memory s = fn == 3 ? "ok|" : "ok";
            for (uint256 i = 0; i < o.length; ++i) {
                if (fn == 3) {
                    s = string.concat(s, i == 0 ? "" : sep, vm.toString(o[i]));
                } else {
                    s = string.concat(s, sep, vm.toString(o[i]));
                }
            }
            return s;
        } catch (bytes memory e) {
            return _rv(e);
        }
    }

    function _rv(bytes memory e) internal pure returns (string memory) {
        if (e.length == 36 && bytes4(e) == bytes4(0x4e487b71)) {
            uint256 code;
            assembly {
                code := mload(add(e, 36))
            }
            if (code == 0x11) return "rv|overflow";
            if (code == 0x12) return "rv|div_zero";
            return string.concat("rv|panic_", vm.toString(code));
        }
        if (e.length == 4 && bytes4(e) == bytes4(keccak256("ExpOverflow()"))) return "rv|exp_overflow";
        if (e.length == 4 && bytes4(e) == bytes4(keccak256("LnWadUndefined()"))) return "rv|ln_undefined";
        if (e.length == 36 && bytes4(e) == bytes4(keccak256("SafeCastOverflowedUintToInt(uint256)"))) {
            return "rv|safecast_uint_to_int";
        }
        return string.concat("rv|other_", vm.toString(e));
    }
}
