// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Coinstark} from "../../src/Coinstark.sol";

/// @dev Test-only CREATE2 deployer, used to distinguish the factory from its caller.
contract CoinstarkFactoryHarness {
    function deploy(bytes32 salt) external returns (Coinstark) {
        return new Coinstark{salt: salt}();
    }
}
