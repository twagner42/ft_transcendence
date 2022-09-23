import { eChannelType } from "./constants";
export interface MessageDto {
  content: string;
  fromUserId: string;
  toChannelId: Channel;
}

export interface Message extends MessageDto {
  id: string;
}

export interface Channel {
  id: string;
  name: string;
  type: eChannelType;
  users: ChannelUser[];
  createdAt: number;
  messages?: Message[];
  password?: string;
}

export interface JoinChannelDto {
  id: string;
  name: string; //debugging purposes
  userId: string;
  password?: string;
}

export interface ChatUser {
  socketId: string;
  id: string;
  name: string;
  channels?: string[];
  directMessges?: string[];
}

export interface ChannelUser {
  id: string;
  role: string;
}

export interface CreateChannelDto {
  name: string;
  type: string;
  users: ChannelUser[];
  password?: string;
}
