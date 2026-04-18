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

    /// @notice Verify a WebAuthn assertion over `expectedChallenge`.
    /// @param authenticatorData Raw authenticator-data bytes from navigator.credentials.get().
    /// @param clientDataJSON    Raw clientDataJSON bytes from navigator.credentials.get().
    /// @param r                 ECDSA signature component (already normalized for low-s).
    /// @param s                 ECDSA signature component.
    /// @param pubKeyX           Stored public-key X coordinate for this account.
    /// @param pubKeyY           Stored public-key Y coordinate for this account.
    /// @param expectedChallenge 32-byte value that must appear inside clientDataJSON, base64url-encoded.
    /// @return valid True iff the signature verifies AND the challenge is present.
    function verify(
        bytes memory authenticatorData,
        bytes memory clientDataJSON,
        bytes32 r,
        bytes32 s,
        bytes32 pubKeyX,
        bytes32 pubKeyY,
        bytes32 expectedChallenge
    ) internal view returns (bool valid) {
        bytes memory expected = bytes(_base64UrlEncode32(expectedChallenge));
        if (!_contains(clientDataJSON, expected)) return false;

        bytes32 clientDataHash = sha256(clientDataJSON);
        bytes memory toSign = abi.encodePacked(authenticatorData, clientDataHash);
        bytes32 messageHash = sha256(toSign);

        bytes memory input = abi.encodePacked(messageHash, r, s, pubKeyX, pubKeyY);
        (bool ok, bytes memory out) = P256_VERIFIER.staticcall(input);
        if (!ok || out.length < 32) return false;
        return uint256(bytes32(out)) == 1;
    }

    /// @dev Encode a bytes32 as base64url (no padding). Always yields 43 chars.
    ///      Alphabet: A-Z a-z 0-9 - _
    function _base64UrlEncode32(bytes32 data) private pure returns (string memory) {
        bytes memory alphabet = bytes("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_");
        bytes memory raw = abi.encodePacked(data); // 32 bytes
        bytes memory result = new bytes(43);
        uint256 i;
        uint256 j;
        // Process 10 groups of 3 bytes = 30 bytes → 40 chars.
        for (i = 0; i < 30; i += 3) {
            uint24 triple = (uint24(uint8(raw[i])) << 16) | (uint24(uint8(raw[i + 1])) << 8) | uint24(uint8(raw[i + 2]));
            result[j++] = alphabet[(triple >> 18) & 0x3F];
            result[j++] = alphabet[(triple >> 12) & 0x3F];
            result[j++] = alphabet[(triple >> 6) & 0x3F];
            result[j++] = alphabet[triple & 0x3F];
        }
        // Final 2 bytes → 3 chars (no padding).
        uint24 pair = (uint24(uint8(raw[30])) << 16) | (uint24(uint8(raw[31])) << 8);
        result[j++] = alphabet[(pair >> 18) & 0x3F];
        result[j++] = alphabet[(pair >> 12) & 0x3F];
        result[j] = alphabet[(pair >> 6) & 0x3F];
        return string(result);
    }

    /// @dev Naive substring search. Safe here because `needle` is 43 chars of
    ///      high-entropy base64url — collisions with non-challenge text are
    ///      cryptographically negligible.
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
