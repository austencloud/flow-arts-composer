
import { LibrarySaveService } from './services/library-save-service';
import { getSharer } from '#lib/shared/share/get-sharer.js';
import { getVideoUploader } from '#lib/shared/share/get-video-uploader.js';
import { getLibraryRepository } from '#lib/shared/library/get-library-repository.js';
import { getArtifactExtractor } from './get-artifact-extractor';

let instance: LibrarySaveService | null = null;
export function getLibrarySaveService(): LibrarySaveService {
  return instance ??= new LibrarySaveService(
    getSharer(),
    getVideoUploader(),
    getLibraryRepository(),
    getArtifactExtractor()
  );
}
