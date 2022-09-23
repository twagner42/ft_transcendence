import { Socket, Server } from 'socket.io';
import { WebSocketServer } from '@nestjs/websockets';
import { MessageDto, CreateChannelDto, JoinChannelDto } from './dto';
import { v4 as uuidv4 } from 'uuid';
import * as Cookie from 'cookie';
import { Channel, ChannelUser, ChatUser, Message } from './entities';
import { eChannelType, eChannelUserRole, eEvent } from './constants';
import { Inject } from '@nestjs/common';
import Redis from 'redis';

enum REDIS_DB {
  USERS_DB = 1,
  CHANNELS_DB,
  MSG_DB,
}

export class ChatService {
  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis.RedisClientType,
  ) {}

  @WebSocketServer()
  server: Server;

  messageBotId: string;

  async handleMessage(client: Socket, message: MessageDto) {
    console.log(
      `Recieved message ${JSON.stringify(message, null, 4)} from socket ${
        client.id
      }`,
    );
    const date = Date.now();
    const msg: Message = {
      id: message.fromUserId + String(date + Math.random() * 100),
      sentDate: date,
      content: message.content,
      fromUserId: message.fromUserId,
      toChannelOrUserId: message.toChannelOrUserId,
    };
    await this.setObject<Message>(msg.id, msg, REDIS_DB.MSG_DB);
    const allMessages = await this.getAll(REDIS_DB.MSG_DB);
    // this.allMessages.push(msg);
    console.log(`This is a list of all messages`);
    allMessages.map((msg) => console.log(JSON.stringify(msg, null, 4)));
    console.log(`End of all messags`);
    this.server.emit(eEvent.UpdateMessages, allMessages);
  }

  async handleJoinChannel(client: Socket, joinChannelDto: JoinChannelDto) {
    const channel: Channel = await this.getObject(
      joinChannelDto.id,
      REDIS_DB.CHANNELS_DB,
    );
    console.log(
      `This is the channel found by find ${JSON.stringify(channel, null, 4)}`,
    );

    if (
      joinChannelDto.type === eChannelType.Protected &&
      joinChannelDto.password !== channel.password
    ) {
      client.emit(eEvent.JoinChannelResponse, { msg: 'bad password' });
      return;
    }
    client.join(joinChannelDto.id);
    if (
      //   !channel.users.find(
      //     (user: ChannelUser) => user.id === joinChannelDto.userId,
      //   )
      !channel.users[joinChannelDto.userId]
    ) {
      const joinedChannelAt = Date.now();
      const channelUser: ChannelUser = {
        id: joinChannelDto.userId,
        role: eChannelUserRole.User, //to be included in the joinChannelDto
        joinedChannelAt,
        isMuted: false,
      };
      // channel.users.push(channelUser);
      channel.users[joinChannelDto.userId] = channelUser;

      this.setObject(channel.id, channel, REDIS_DB.CHANNELS_DB);
    }
    client.emit(eEvent.JoinChannelResponse, {
      msg: 'changed channel',
      channel,
    });
    // manage bot sending message
    // const userId = this.allClients.find((cli) => cli.socketId === client.id).id;
    // this._joinedChannelBot(userId, joinChannelDto.id);
  }

  handleSetId(client: Socket, hasUserId: string) {
    if (hasUserId) return;
    console.log(`Setting id for user ${client.id}`);
    const userId = uuidv4();
    client.emit(eEvent.SetIdResponse, userId);
  }

  async addUser(client: Socket, id: string) {
    const names = [
      'George',
      'Toto',
      'Judu',
      'Masto',
      'Flo monBg',
      'Nouf',
      'Karpathy',
      'Lex',
    ];
    const userDb: ChatUser = await this.getObject(id, REDIS_DB.USERS_DB);
    if (!userDb) {
      const chatUser: ChatUser = {
        socketId: client.id,
        id,
        name: names[Math.floor(Math.random() * 10) % names.length],
        profilePicture:
          'https://cdn.discordapp.com/avatars/805814511000354867/32ec044071e86e151aeab667f6acc48f.webp?size=32',
      };
      console.log(`Adding user name: ${chatUser.name}, id: ${id}`);
      this.setObject(chatUser.id, chatUser, REDIS_DB.USERS_DB);
      client.emit(eEvent.AddUserResponse, chatUser);
      const allUsers: ChatUser[] = await this.getAll(REDIS_DB.USERS_DB);
      this.server.emit(eEvent.UpdateUsers, allUsers);
    }
  }

  async createChannel(client: Socket, channelDto: CreateChannelDto) {
    // if channel name taken but channel is private it's okay
    const allChannels: Channel[] = await this.getAll(REDIS_DB.CHANNELS_DB);
    console.log(`all channels = ${allChannels}`);
    for (const channel of allChannels) {
      console.log(`Channel ${JSON.stringify(channel, null, 4)}`);
      if (channel.name === channelDto.name) {
        console.log('Found a channel with the same name');
        client.emit(eEvent.CreateChannelResponse, {
          msg: 'channel name already taken',
        });
        return;
      }
    }
    const createdAt = Date.now();
    const channel: Channel = {
      id: uuidv4(),
      name: channelDto.name,
      type: channelDto.type,
      createdAt,
      users: [],
      password: channelDto.password,
    };
    channel.users = channelDto.users.map((user) => {
      const channelUser: ChannelUser = {
        id: user.id,
        role: user.role,
        joinedChannelAt: createdAt,
        isMuted: false,
      };
      return channelUser;
    });

    this.setObject(channel.id, channel, REDIS_DB.CHANNELS_DB);
    client.join(channel.id);
    client.emit(eEvent.CreateChannelResponse, {
      msg: 'channel created successfuly',
      channel,
    });

    allChannels.push(channel);
    this.server.emit(eEvent.UpdateChannels, allChannels);
  }

  async handleAddedToRoom(client: Socket, channelId: string) {
    const allChannels: Channel[] = await this.getAll(REDIS_DB.CHANNELS_DB);
    const allUsers: ChatUser[] = await this.getAll(REDIS_DB.USERS_DB);
    const userId = this.parseIdCookie(client.handshake.headers.cookie);
    const user = allUsers.find((user) => user.id === userId);
    const chan = allChannels.find((channel) => channel.id === channelId);
    console.log(`User ${user.name} is joinined room ${chan.name}`);
    client.join(channelId);
  }

  async getAll<T>(dataBase: REDIS_DB): Promise<T[]> {
    this.redis.select(dataBase);
    const allKeys = await this.redis.keys('*');
    const allValues: T[] = [];
    await Promise.all(
      allKeys.map(async (key: string) => {
        const value: T = await this.getObject(key, dataBase);
        allValues.push(value);
        return;
      }),
    );
    return allValues;
  }

  async setObject<T>(key: string, value: T, dataBase: number) {
    await this.redis.select(dataBase);
    await this.redis.json.set(key, '.', JSON.parse(JSON.stringify(value)));
  }

  async getObject<T>(key: string, dataBase: REDIS_DB): Promise<T> {
    await this.redis.select(dataBase);
    const type = await this.redis.type(key);
    const jsonObj: T = (await this.redis.json.get(key, { path: '.' })) as any;
    return jsonObj;
  }

  // trying to emit private channels only to the people who are inside it
  // and protected to everyone
  initBot() {
    this.messageBotId = uuidv4();
  }

  parseIdCookie(cookies) {
    if (cookies) {
      const cookiesObj = Cookie.parse(cookies);
      if (cookiesObj['id']) return cookiesObj['id'];
    }
    return null;
  }

  async getJson() {
    this.redis.select(2);
    console.log('this is res');
    const res = await this.redis.json.get(
      '$.users[?(@.id==="4c28308d-37c8-4c7e-ba38-169ca7d43cd9")]',
    );
    const res2 = await this.redis.json.get(
      '5d7dc013-a32e-45ea-8767-d65954214f9b',
      { path: '.users[?(@.id=="4c28308d-37c8-4c7e-ba38-169ca7d43cd9")]' },
    );
    console.log(JSON.stringify(res, null, 4));
    console.log('this is res 2');
    console.log(JSON.stringify(res2, null, 4));
  }

  private _joinedChannelBot(userId: string, channelId: string) {
    const date = Date.now();
    const message: Message = {
      content: `User ${userId} has joined channelName`,
      id: String(date + Math.random() * 100),
      sentDate: date,
      toChannelOrUserId: channelId,
      fromUserId: '0000000000',
    };
    this.server.to(channelId).emit(eEvent.UserJoined, message);
  }
}
