import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { getSession } from '@/modules/auth';

export default async function DashboardPage() {
  const session = await getSession();
  return (
    <Paper sx={{ p: 3, maxWidth: 640 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Welcome
      </Typography>
      <Typography color="text.secondary">
        Signed in as {session?.email} ({session?.role}). Invoicing, customers, payments, and
        reports modules will appear here.
      </Typography>
    </Paper>
  );
}
