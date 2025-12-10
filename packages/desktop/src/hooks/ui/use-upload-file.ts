// Stub for file upload hook - not used in desktop app
export const useUploadFile = (_opts?: { onUploadComplete?: () => void }) => ({
  uploadFiles: async () => {},
  uploadedFiles: [],
  isUploading: false,
  progress: 0,
  uploadedFile: null as File | null,
  uploadFile: async (_file: File) => {},
  uploadingFile: null as File | null,
});

export function generateReactHelpers() {
  return {
    useUploadThing: () => ({
      startUpload: async () => [],
      isUploading: false,
      permittedFileInfo: undefined,
    }),
    uploadFiles: async () => [],
  };
}
