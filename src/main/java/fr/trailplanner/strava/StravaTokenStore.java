package fr.trailplanner.strava;

import com.fasterxml.jackson.databind.ObjectMapper;
import fr.trailplanner.api.JsonSupport;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Optional;

/** Jetons gardés dans un fichier, lisible par le seul utilisateur : l'appli est locale et personnelle. */
public class StravaTokenStore {

    private final ObjectMapper mapper = JsonSupport.mapper();
    private final Path file;

    public StravaTokenStore(Path file) {
        this.file = file;
    }

    public synchronized Optional<StravaToken> load() {
        if (!Files.exists(file)) {
            return Optional.empty();
        }
        try {
            return Optional.of(mapper.readValue(file.toFile(), StravaToken.class));
        } catch (IOException e) {
            // Fichier abîmé : on repart d'une connexion neuve plutôt que de bloquer.
            return Optional.empty();
        }
    }

    public synchronized void save(StravaToken token) {
        try {
            Files.createDirectories(file.toAbsolutePath().getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.write(tmp, mapper.writeValueAsBytes(token));
            try {
                Files.setPosixFilePermissions(tmp, PosixFilePermissions.fromString("rw-------"));
            } catch (UnsupportedOperationException ignored) {
                // Windows : pas de droits POSIX.
            }
            Files.move(tmp, file, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            throw new UncheckedIOException("Impossible d'enregistrer les jetons Strava dans " + file, e);
        }
    }

    public synchronized void delete() {
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
