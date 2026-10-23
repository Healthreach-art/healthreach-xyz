import App from '../../page';
// Firebase persistence is browser-managed. No private records render on the server;
// the workspace API verifies the Firebase token and stored role before returning data.
export default function Dashboard(){return <App initialDashboard/>;}
