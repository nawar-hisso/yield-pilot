// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title WebAuthn
/// @notice Verify WebAuthn (passkey) signatures on-chain using the RIP-7212
///         P-256 precompile at address 0x100. Activated on Sepolia (Pectra)
///         and all Base chains.
/// @dev WebAuthn signs `sha256(authenticatorData || sha256(clientDataJSON))`
///      with the authenticator's P-256 key. We reconstruct that hash, verify
///      the signature, and confirm the clientDataJSON contains the challenge
///      we expect (the userOpHash, base64url-encoded without padding).
library WebAuthn {
    address internal constant P256_VERIFIER = address(0x100);

    /// @notice Maximum clientDataJSON size accepted — caps attacker-controlled
    ///         input on the `_contains` hot path and bounds simulation gas.
    uint256 internal constant MAX_CLIENT_DATA_JSON = 1024;

    /// @notice User-present flag (AD flag bit 0). Required by WebAuthn Level 2 §6.1.
    uint8 internal constant UP_FLAG = 0x01;

    /// @notice authenticatorData fixed prefix: rpIdHash(32) || flags(1) || signCount(4) = 37 bytes.
    uint256 internal constant AUTH_DATA_MIN_LEN = 37;

    bytes internal constant ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    /// @notice Verify a WebAuthn assertion over `expectedChallenge`.
    /// @param authenticatorData Raw authenticator-data bytes from navigator.credentials.get().
    /// @param clientDataJSON    Raw clientDataJSON bytes from navigator.credentials.get().
    /// @param r                 ECDSA signature component (already normalized for low-s).
    /// @param s                 ECDSA signature component.
    /// @param pubKeyX           Stored public-key X coordinate for this account.
    /// @param pubKeyY           Stored public-key Y coordinate for this account.
    /// @param expectedChallenge 32-byte value that must appear inside clientDataJSON, base64url-encoded.
    /// @return valid True iff: UP flag is set, type is "webauthn.get", challenge matches,
    ///               and the RIP-7212 precompile confirms the signature.
    function verify(
        bytes memory authenticatorData,
        bytes memory clientDataJSON,
        bytes32 r,
        bytes32 s,
        bytes32 pubKeyX,
        bytes32 pubKeyY,
        bytes32 expectedChallenge
    ) internal view returns (bool valid) {
        // 1. Bound attacker-controlled input.
        if (clientDataJSON.length > MAX_CLIENT_DATA_JSON) return false;

        // 2. authenticatorData must be long enough + user-present flag set.
        if (authenticatorData.length < AUTH_DATA_MIN_LEN) return false;
        if (uint8(authenticatorData[32]) & UP_FLAG == 0) return false;

        // 3. Challenge binding — anchored to `"challenge":"<base64url(hash)>"`.
        //    Substring-on-arbitrary-JSON is NOT sufficient: a custom extension
        //    field could legitimately contain the 43-char challenge value.
        bytes memory needle = abi.encodePacked(bytes('"challenge":"'), bytes(_base64UrlEncode32(expectedChallenge)), bytes('"'));
        if (!_contains(clientDataJSON, needle)) return false;

        // 4. type must be "webauthn.get" (assertion), not "webauthn.create" (registration).
        if (!_contains(clientDataJSON, bytes('"type":"webauthn.get"'))) return false;

        // 5. Reconstruct the signed digest and dispatch to the precompile.
        bytes32 clientDataHash = sha256(clientDataJSON);
        bytes memory toSign = abi.encodePacked(authenticatorData, clientDataHash);
        bytes32 messageHash = sha256(toSign);

        bytes memory input = abi.encodePacked(messageHash, r, s, pubKeyX, pubKeyY);
        (bool ok, bytes memory out) = P256_VERIFIER.staticcall(input);
        if (!ok || out.length < 32) return false;
        return uint256(bytes32(out)) == 1;
    }

    /// @dev Encode a bytes32 as base64url (no padding). Always yields 43 chars.
    function _base64UrlEncode32(bytes32 data) private pure returns (string memory) {
        bytes memory raw = abi.encodePacked(data); // 32 bytes
        bytes memory result = new bytes(43);
        uint256 j;
        // 10 groups of 3 bytes → 40 chars.
        for (uint256 i = 0; i < 30; i += 3) {
            uint24 triple = (uint24(uint8(raw[i])) << 16)
                | (uint24(uint8(raw[i + 1])) << 8)
                | uint24(uint8(raw[i + 2]));
            result[j++] = ALPHABET[(triple >> 18) & 0x3F];
            result[j++] = ALPHABET[(triple >> 12) & 0x3F];
            result[j++] = ALPHABET[(triple >> 6) & 0x3F];
            result[j++] = ALPHABET[triple & 0x3F];
        }
        // Final 2 bytes → 3 chars (no padding).
        uint24 pair = (uint24(uint8(raw[30])) << 16) | (uint24(uint8(raw[31])) << 8);
        result[j++] = ALPHABET[(pair >> 18) & 0x3F];
        result[j++] = ALPHABET[(pair >> 12) & 0x3F];
        result[j] = ALPHABET[(pair >> 6) & 0x3F];
        return string(result);
    }

    /// @dev Naive substring search. Safe here because needles are either
    ///      JSON field markers or 43 chars of high-entropy base64url.
    function _contains(bytes memory haystack, bytes memory needle) private pure returns (bool) {
        uint256 nLen = needle.length;
        uint256 hLen = haystack.length;
        if (nLen == 0) return true;
        if (nLen > hLen) return false;
        unchecked {
            for (uint256 i = 0; i <= hLen - nLen; i++) {
                bool match_ = true;
                for (uint256 k = 0; k < nLen; k++) {
                    if (haystack[i + k] != needle[k]) {
                        match_ = false;
                        break;
                    }
                }
                if (match_) return true;
            }
        }
        return false;
    }
}
