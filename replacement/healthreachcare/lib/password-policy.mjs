export const passwordHelp='Use at least 6 characters, including a letter and a number or special character.';
export function validPassword(value){return typeof value==='string'&&value.length>=6&&/[a-zA-Z]/.test(value)&&/[^a-zA-Z\s]/.test(value);}
