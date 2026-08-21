package br.com.absono.common

import java.security.SecureRandom
import java.time.Instant

class Ulid {

    private static final String ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    private static final SecureRandom RANDOM = new SecureRandom()
    private static final int TIMESTAMP_CHARS = 10
    private static final int RANDOM_CHARS = 16

    static String generate() {
        StringBuilder sb = new StringBuilder()
        Instant now = Instant.now()
        long timestamp = now.toEpochMilli()

        long tmp = timestamp
        char[] chars = new char[TIMESTAMP_CHARS]
        for (int i = TIMESTAMP_CHARS - 1; i >= 0; i--) {
            chars[i] = ALPHABET[(int)(tmp % 32)]
            tmp = tmp / 32
        }
        sb.append(chars)

        for (int i = 0; i < RANDOM_CHARS; i++) {
            sb.append(ALPHABET[RANDOM.nextInt(32)])
        }

        return sb.toString()
    }

    static boolean isValid(String ulid) {
        if (!ulid || ulid.length() != 26) return false
        return ulid.every { ALPHABET.contains(it) }
    }
}
