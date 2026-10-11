package fr.trailplanner.extract;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/** Lecture de la liste du matériel obligatoire (règlement en image ou PDF) pour pré-remplir la checklist. */
@RestController
@RequestMapping("/api/gear")
public class GearController {

    private final GearExtractionService service;

    public GearController(GearExtractionService service) {
        this.service = service;
    }

    @PostMapping(path = "/extract", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ExtractedGear extract(@RequestPart("file") MultipartFile file,
                                 @RequestParam(required = false) String raceName) throws IOException {
        return service.extract(file.getBytes(), file.getOriginalFilename(), raceName);
    }
}
