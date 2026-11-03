export async function readResponseJson(response, context = 'The server response') {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    const html = /^\s*(?:<!doctype html|<html)/i.test(body);
    throw new Error(html
      ? `${context} returned a website page instead of data (HTTP ${response.status}). Refresh the page; if it continues, this API route is missing from the current deployment.`
      : `${context} returned unreadable data. Refresh and try again.`);
  }
}
