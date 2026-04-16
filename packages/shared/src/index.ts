export interface Room {
  id: string;
  name: string;
  color?: string;
  category?: string;
  disableMeeting?: boolean;
  externalMeetUrl?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  imageUrl?: string;
}

export interface PresenceEvent {
  user: User;
  roomId: string;
  inMeeting: boolean;
}
