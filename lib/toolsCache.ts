import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_FC = (noteId: string) => `tools:flashcards:${noteId}`;
const KEY_QZ = (noteId: string) => `tools:quiz:${noteId}`;

export async function getFlashcards(noteId: string) {
  try {
    const raw = await AsyncStorage.getItem(KEY_FC(noteId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export async function setFlashcards(noteId: string, cards: any) {
  try {
    await AsyncStorage.setItem(KEY_FC(noteId), JSON.stringify(cards));
  } catch {}
}

export async function getQuiz(noteId: string) {
  try {
    const raw = await AsyncStorage.getItem(KEY_QZ(noteId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export async function setQuiz(noteId: string, quiz: any) {
  try {
    await AsyncStorage.setItem(KEY_QZ(noteId), JSON.stringify(quiz));
  } catch {}
}

export async function clearNoteTools(noteId: string) {
  try {
    await AsyncStorage.multiRemove([KEY_FC(noteId), KEY_QZ(noteId)]);
  } catch {}
}
