import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { ChatService } from './chat.service';
import { Socket } from 'socket.io';
import { OnModuleInit, Logger } from '@nestjs/common';
import { MessageDto, CreateChannelDto, JoinChannelDto } from './dto';
import { ChatUser, Channel } from './entities';
import { eRedisDb, eEvent } from './constants';
import { Hashtable } from './interfaces/hashtable.interface';
import { ChannelType } from '@prisma/client';
import { RequestUser } from 'src/common/entities';

@WebSocketGateway({
  cors: {
    credentials: true,
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  },
})
export class ChatGateway
  implements
    OnModuleInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit
{
  constructor(private readonly chatService: ChatService) {}
  private readonly logger = new Logger(ChatGateway.name);

  onModuleInit() {
    this.logger.log(`Module chat is up`);
  }

  async afterInit(server: any) {
    this.chatService.initBot();
    this.chatService.server = server;
    this.chatService.initRedis();
  }

  async handleConnection(client: Socket, ...args: any[]) {
    const user = client.handshake.auth.id;
    client.join(user.id);
    this.logger.debug(
      `User id:${user} with socket id:${client.id} is trying to connect`,
    );
  }

  async handleDisconnect(client: Socket) {
    const sessionCookie = this.chatService.parseIdCookie(
      client.handshake.headers.cookie,
    );
    if (sessionCookie) {
      const user = await this.chatService.getObject<RequestUser>(
        sessionCookie,
        eRedisDb.Sessions,
      );
      this.logger.debug(`client ${client.id} disconnected`);
    }
  }

  @SubscribeMessage(eEvent.InitConnection)
  initConnection(client: Socket, channelIds: string[]) {
    this.logger.debug(
      `Initing connection for user ${client.handshake.auth.id} and socket.id ${client.id}`,
    );
    this.chatService.initConnection(client, channelIds);
  }

  @SubscribeMessage(eEvent.SendMessage)
  handleMessage(client: Socket, message: MessageDto) {
    this.logger.log(
      `Recieved message ${JSON.stringify(message, null, 4)} from socket ${
        client.id
      }`,
    );
    console.log('messages recieved');
    return this.chatService.handleMessage(client, message);
  }

  @SubscribeMessage(eEvent.JoinChannel)
  handleJoinChannel(client: Socket, channel: JoinChannelDto) {
    this.logger.debug(
      `This is channel joining ${JSON.stringify(channel, null, 4)}`,
    );
    return this.chatService.handleJoinChannel(client, channel);
  }

  @SubscribeMessage(eEvent.UpdateOneChannel)
  updateOneChannel(client: Socket, channel: { id: number; type: ChannelType }) {
    this.logger.debug(`gateway ${channel.id} and type ${channel.type}`);
    return this.chatService.updateOneChannel(client, channel.id, channel.type);
  }

  @SubscribeMessage(eEvent.CreateChannel)
  handleCreateChannel(client: Socket, channelId: number) {
    return this.chatService.createChannel(client, channelId);
  }
  //on login: create room with (user_userId) if doesnt exist
  // json.set(rooms, '.rooms[roomId', )
  //on create channel: create room with (room_channelId)

  // on connect the user sends their channel information (all Ids)
  // the server then adds the socket to the rooms.
  // (for const channelId in channelIds)
  // socket.join(channelId)
}
