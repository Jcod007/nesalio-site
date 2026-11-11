/** Une photo d'exercice, redimensionnée avant l'envoi. */
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_MAX_BYTES = 1_500_000;
export const PHOTO_MAX_TEXT = 3500;
/** Question de l'élève (500 caractères), énoncé reconnu et séparateur. */
export const PHOTO_MAX_QUESTION = 4500;

export interface PhotoReading {
  text: string;
  uncertainties: string[];
}
