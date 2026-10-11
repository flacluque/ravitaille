package fr.trailplanner.extract;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

/** Lecture automatique d'un roadbook (image ou PDF) pour pré-remplir l'éditeur du front. */
@RestController
@RequestMapping("/api/roadbooks")
public class RoadbookController {

    private final RoadbookExtractionService service;

    public RoadbookController(RoadbookExtractionService service) {
        this.service = service;
    }

    /** L'IA de lecture est-elle configurée et prête ? Sinon, que faire ? */
    @GetMapping("/extractor")
    public RoadbookExtractor.Status extractor() {
        return service.status();
    }

    @PostMapping(path = "/extract", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ExtractedRoadbook extract(@RequestPart("file") MultipartFile file) throws IOException {
        return service.extract(file.getBytes(), file.getOriginalFilename());
    }

    @ExceptionHandler(ExtractionException.class)
    public ProblemDetail extractionFailed(ExtractionException e) {
        HttpStatus status = e.isUnavailable() ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
        return ProblemDetail.forStatusAndDetail(status, e.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail badRequest(IllegalArgumentException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }
}
