// End only the HealthReachCare persona session. Platform identity is independent.
export async function logoutApplication({storage, request, navigate, onCleared}) {
    const token = storage.getItem('hrc-demo-session');
    if (token) {
        const response = await request('/api/workspace', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'x-demo-session': token},
            body: JSON.stringify({action: 'endDemoSession', payload: {}}),
            cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok || result.sessionEnded !== true)
            throw Error(result.error || 'HealthReachCare sign-out could not be confirmed. Please retry.');
    }
    storage.removeItem('hrc-demo-session');
    storage.removeItem('hrc-demo-account');
    onCleared();
    navigate('/');
}
