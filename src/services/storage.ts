import { deleteObject, getDownloadURL, ref, uploadBytesResumable, type UploadTaskSnapshot } from "firebase/storage";
import { storage } from "@/lib/firebase";

export function slidePath(classroomId: string, lessonId: string, pageId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `classrooms/${classroomId}/lessons/${lessonId}/pages/${pageId}/${Date.now()}_${safeName}`;
}

export function uploadSlideFile(
  path: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on(
      "state_changed",
      (snap: UploadTaskSnapshot) => {
        onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      (err) => reject(err),
      async () => {
        resolve(path);
      }
    );
  });
}

export async function getSlideDownloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

export async function deleteSlideFile(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}
