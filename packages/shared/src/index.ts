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

export interface PresenceUser extends User {
  socketId: string;
  inMeeting: boolean;
}

export interface PresenceEvent {
  user: PresenceUser;
  roomId: string;
}

export type ServerToClientEvents = {
  "presence:snapshot": (state: Record<string, PresenceUser[]>) => void;
  "presence:enter": (evt: PresenceEvent) => void;
  "presence:leave": (payload: { userId: string; roomId: string }) => void;
  "presence:meeting": (payload: { userId: string; inMeeting: boolean }) => void;
};

export type ClientToServerEvents = {
  "presence:join": (roomId: string) => void;
  "presence:meeting-start": () => void;
  "presence:meeting-end": () => void;
};
