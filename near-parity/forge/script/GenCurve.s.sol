// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Script} from "forge-std/Script.sol";
import {CurveHarness} from "../src/CurveHarness.sol";

contract GenCurve is Script {
    string internal constant IN_FILE = "work/curve-in.json";
    string internal constant OUT_FILE = "work/curve-sol.txt";

    function run() external {
        CurveHarness h = new CurveHarness();
        string memory json = vm.readFile(IN_FILE);
        uint256[] memory fns = vm.parseJsonUintArray(json, ".fn");
        string[] memory a = vm.parseJsonStringArray(json, ".a");
        string[] memory b = vm.parseJsonStringArray(json, ".b");
        string[] memory c = vm.parseJsonStringArray(json, ".c");
        string[] memory d = vm.parseJsonStringArray(json, ".d");
        vm.writeFile(OUT_FILE, "");
        for (uint256 i = 0; i < fns.length; ++i) {
            vm.writeLine(OUT_FILE, _row(h, fns[i], vm.parseUint(a[i]), vm.parseUint(b[i]), vm.parseUint(c[i]), vm.parseUint(d[i])));
        }
    }

    function _row(CurveHarness h, uint256 fn, uint256 a, uint256 b, uint256 c, uint256 d)
        internal
        view
        returns (string memory)
    {
        if (fn == 0) {
            try h.ceilDiv(a, b) returns (uint256 r) {
                return _ok1(r);
            } catch (bytes memory e) {
                return _rv(e);
            }
        }
        if (fn == 1) {
            try h.feeOf(a, b) returns (uint256 r) {
                return _ok1(r);
            } catch (bytes memory e) {
                return _rv(e);
            }
        }
        if (fn == 2) {
            try h.buyOut(a, b, c) returns (uint256 r0, uint256 r1) {
                return _ok2(r0, r1);
            } catch (bytes memory e) {
                return _rv(e);
            }
        }
        if (fn == 3) {
            try h.sellGross(a, b, c) returns (uint256 r) {
                return _ok1(r);
            } catch (bytes memory e) {
                return _rv(e);
            }
        }
        if (fn == 4) {
            try h.boostedVTok(a, b, c) returns (uint256 r) {
                return _ok1(r);
            } catch (bytes memory e) {
                return _rv(e);
            }
        }
        if (fn == 5) {
            try h.splitLoss(a, b, c, d) returns (uint256 r0, uint256 r1, uint256 r2, uint256 r3) {
                return string.concat("ok|", vm.toString(r0), "|", vm.toString(r1), "|", vm.toString(r2), "|", vm.toString(r3));
            } catch (bytes memory e) {
                return _rv(e);
            }
        }
        if (fn == 6) {
            try h.quoteBuy(a, b, c, d) returns (uint256 r0, uint256 r1, uint256 r2, uint256 r3) {
                return string.concat("ok|", vm.toString(r0), "|", vm.toString(r1), "|", vm.toString(r2), "|", vm.toString(r3));
            } catch (bytes memory e) {
                return _rv(e);
            }
        }
        if (fn == 7) {
            try h.quoteSell(a, b, c, d) returns (uint256 r0, uint256 r1, uint256 r2) {
                return string.concat("ok|", vm.toString(r0), "|", vm.toString(r1), "|", vm.toString(r2));
            } catch (bytes memory e) {
                return _rv(e);
            }
        }
        if (fn == 8) {
            try h.launchSeed(a, b, c) returns (uint256 r0, uint256 r1, uint256 r2) {
                return string.concat("ok|", vm.toString(r0), "|", vm.toString(r1), "|", vm.toString(r2));
            } catch (bytes memory e) {
                return _rv(e);
            }
        }
        revert("unknown fn");
    }

    function _ok1(uint256 r) internal pure returns (string memory) {
        return string.concat("ok|", vm.toString(r));
    }

    function _ok2(uint256 r0, uint256 r1) internal pure returns (string memory) {
        return string.concat("ok|", vm.toString(r0), "|", vm.toString(r1));
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
        if (e.length == 4 && bytes4(e) == bytes4(keccak256("BadSeed()"))) return "rv|bad_seed";
        return string.concat("rv|other_", vm.toString(e));
    }
}
