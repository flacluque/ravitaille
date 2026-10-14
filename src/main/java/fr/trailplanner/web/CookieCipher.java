package fr.trailplanner.web;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;

/**
 * Chiffre ce qu'on confie au navigateur dans un cookie (AES-GCM : illisible et infalsifiable sans la clé),
 * et signe les valeurs qui n'ont pas à être secrètes (HMAC).
 */
public class CookieCipher {

    private static final int IV_BYTES = 12;
    private final SecretKeySpec aesKey;
    private final SecretKeySpec macKey;
    private final SecureRandom random = new SecureRandom();

    public CookieCipher(String secret) {
        byte[] seed = sha256(secret.getBytes(StandardCharsets.UTF_8));
        this.aesKey = new SecretKeySpec(sha256(concat(seed, "chiffrement")), "AES");
        this.macKey = new SecretKeySpec(sha256(concat(seed, "signature")), "HmacSHA256");
    }

    /** Clé configurée, sinon celle de ~/.trail-planner/secret.key (créée au premier lancement, en local). */
    public static CookieCipher fromSecret(String configured, Path localKeyFile) {
        if (!configured.isBlank()) {
            return new CookieCipher(configured);
        }
        try {
            if (!Files.exists(localKeyFile)) {
                Files.createDirectories(localKeyFile.toAbsolutePath().getParent());
                byte[] bytes = new byte[32];
                new SecureRandom().nextBytes(bytes);
                Files.writeString(localKeyFile, Base64.getEncoder().encodeToString(bytes));
                try {
                    Files.setPosixFilePermissions(localKeyFile, PosixFilePermissions.fromString("rw-------"));
                } catch (UnsupportedOperationException ignored) {
                    // Windows
                }
            }
            return new CookieCipher(Files.readString(localKeyFile).strip());
        } catch (IOException e) {
            throw new UncheckedIOException("Clé des cookies illisible : " + localKeyFile, e);
        }
    }

    public String encrypt(String plain) {
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, aesKey, new GCMParameterSpec(128, iv));
            byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(concat(iv, sealed));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Vide si la valeur a été modifiée, ou chiffrée avec une autre clé. */
    public Optional<String> decrypt(String token) {
        try {
            byte[] all = Base64.getUrlDecoder().decode(token);
            if (all.length <= IV_BYTES) {
                return Optional.empty();
            }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, aesKey, new GCMParameterSpec(128, all, 0, IV_BYTES));
            byte[] plain = cipher.doFinal(all, IV_BYTES, all.length - IV_BYTES);
            return Optional.of(new String(plain, StandardCharsets.UTF_8));
        } catch (IllegalArgumentException | GeneralSecurityException e) {
            return Optional.empty();
        }
    }

    public String sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(macKey);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public boolean verify(String value, String signature) {
        return signature != null && MessageDigest.isEqual(
                sign(value).getBytes(StandardCharsets.US_ASCII), signature.getBytes(StandardCharsets.US_ASCII));
    }

    private static byte[] sha256(byte[] data) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(data);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] concat(byte[] a, String b) {
        return concat(a, b.getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] out = new byte[a.length + b.length];
        System.arraycopy(a, 0, out, 0, a.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }
}
