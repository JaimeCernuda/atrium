import { useEffect, useState } from "react";
import { Container, Typography, Card, CardContent } from "@mui/material";
import Grid from "@mui/material/Grid2";
import type { Room } from "@atrium/shared";

export function App() {
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then(setRooms)
      .catch(console.error);
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h3" gutterBottom>
        Atrium
      </Typography>
      <Grid container spacing={2}>
        {rooms.map((room) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={room.id}>
            <Card sx={{ borderLeft: room.color ? `6px solid ${room.color}` : "none" }}>
              <CardContent>
                <Typography variant="h5">{room.name}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
