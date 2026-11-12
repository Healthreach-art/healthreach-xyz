export async function readResponseJson(response, context = 'The server response') {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    const html = /^\s*(?:<!doctype html|<html)/i.test(body);
    if (html && response.status === 503) {
      throw new Error(`${context} is temporarily unavailable (HTTP 503). Please retry in a moment.`);
    }
    throw new Error(html
      ? `${context} returned a website page instead of data (HTTP ${response.status}). Refresh and try again.`
      : `${context} returned unreadable data. Refresh and try again.`);
  }
}
