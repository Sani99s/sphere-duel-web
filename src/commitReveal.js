export const MOVES = ['rock', 'paper', 'scissors'];

export function generateSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashMove(move, salt) {
  const data = new TextEncoder().encode(`${move}:${salt}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidMove(move) {
  return MOVES.includes(move);
}
