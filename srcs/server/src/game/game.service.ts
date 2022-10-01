import { Inject, Injectable } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import { Game, Player, Physic, Vector, GamePhysics, Client } from './entities/';
import { v4 } from 'uuid';
import {
  UserAlreadyInGameException,
  GameNotFoundException,
  CannotPauseGameException,
  PlayerNotFoundException,
  gameIsPausedException,
  gameRegistrationException,
} from './exceptions/';
import { MatchService } from 'src/match/match.service';
import { CreateMatchDto } from 'src/match/dto/create-match.dto';
import { Match } from 'src/match/entities/match.entity';
import { nickName } from './extra/surnames';
import Redis, { ChainableCommander } from 'ioredis';
import { UserService } from 'src/user/user.service';

/** ************************************************************************* */
/** ENUMS                                                                     */
/** ************************************************************************* */

const enum Move {
  UP = 0,
  DOWN,
}

const enum Body {
  PADDLE = 0,
  BALL,
  WALL,
  GOAL,
}

const enum Wall {
  TOP = 0,
  BOTTOM,
}

const enum Side {
  LEFT = 0,
  RIGHT,
}

const enum Status {
  CREATED = 0,
  STARTED,
  FINISHED,
  NEWBALL,
  PAUSED,
}

enum ePlayerStatus {
  OFFLINE = 0,
  ONLINE,
  WAITING,
  PLAYING,
  SPECTATING,
  CHALLENGE,
}

enum ePlayerMatchMakingStatus {
  NOT_IN_QUEUE = 0,
  IN_QUEUE,
  IN_GAME,
}

const enum eKeys {
  PLAYERSINFOS = 'playersInfos',
}

enum eChallengeWho {
  CHALLENGER = 0,
  CHALLENGEE,
}

enum eChallengeStatus {
  OPEN = 0,
  ACCEPTED,
  REFUSED,
  CANCEL,
}

const enum Motive {
  WIN = 0,
  LOSE,
  ABANDON,
  CANCEL,
}

const Params = Object.freeze({
  LOBBY: 'lobby',
  CANVASW: 900,
  CANVASH: 500,
  BALLSPEED: 6,
  PLAYERSPEED: 10,
  BARWIDTH: 12,
  BARHEIGHT: 54,
  WALLSIZE: 15,
  BALLSIZE: 12,
  BALL_ACCELERATION_TIME: 10,
  BALL_MAX_SPEED: 12,
  PAUSE_TIME: 30,
  CHALLENGE_TIMER: 15,
});

const enum DB {
  GAMES = 10,
  PLAYERS,
  VIEWERS,
  MATCHMAKING,
  PLAYERSINFOS,
}

/** ************************************************************************* */
/** TYPES                                                                     */
/** ************************************************************************* */

type BallIntervall = { game: string; interval?: NodeJS.Timer };
type GameLoop = { id: string; interval: NodeJS.Timer };

@Injectable()
export class GameService {
  // Constructor
  constructor(
    private readonly matchService: MatchService,
    private readonly userService: UserService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    this.clients = [];
    this.ballIntervals = [];
    this.gameLoops = [];
  }

  // Attributes
  server: Server;
  clients: Client[];
  ballIntervals: BallIntervall[];
  gameLoops: GameLoop[];

  /** *********************************************************************** */
  /** USER INFOS                                                              */
  /** *********************************************************************** */

  /** Send updated players info to all clients */
  private async _sendPlayersInfo() {
    const data: any = (
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call('JSON.GET', eKeys.PLAYERSINFOS, '$')
        .exec()
    )[1][1];
    if (data && this.server)
      this.server.emit(eKeys.PLAYERSINFOS, JSON.parse(data)[0]);
  }

  /** Save or update player infos */
  private async _savePlayerInfos(id: string, data: any) {
    const isKey = (
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call('JSON.GET', eKeys.PLAYERSINFOS, '$')
        .exec()
    )[1][1];
    if (!isKey) {
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call(
          'JSON.SET',
          eKeys.PLAYERSINFOS,
          '$',
          JSON.stringify({ players: [] }),
        )
        .exec();
    }
    // If record exists, update, else, append
    const isPlayer: any = (
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call('JSON.GET', eKeys.PLAYERSINFOS, `$.players[?(@.id=="${id}")]`)
        .exec()
    )[1][1];
    if (JSON.parse(isPlayer).length > 0) {
      const player = JSON.parse(isPlayer)[0];
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call(
          'JSON.SET',
          eKeys.PLAYERSINFOS,
          `$.players[?(@.id=="${id}")]`,
          JSON.stringify({ ...player, ...data }),
        )
        .exec();
    } else {
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call(
          'JSON.ARRAPPEND',
          eKeys.PLAYERSINFOS,
          `$..players`,
          JSON.stringify(data),
        )
        .exec();
    }
  }

  /** Check player info */
  private async _checkPlayerInfo(
    id: string,
    key: string,
    value: any,
  ): Promise<boolean> {
    const isKey = (
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call('JSON.GET', eKeys.PLAYERSINFOS, '$')
        .exec()
    )[1][1];
    if (!isKey) {
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call(
          'JSON.SET',
          eKeys.PLAYERSINFOS,
          '$',
          JSON.stringify({ players: [] }),
        )
        .exec();
    }
    // If record exists, update, else, append
    const isPlayer: any = (
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call('JSON.GET', eKeys.PLAYERSINFOS, `$.players[?(@.id=="${id}")]`)
        .exec()
    )[1][1];
    if (JSON.parse(isPlayer).length > 0) {
      if (JSON.parse(isPlayer)[0][key] === value) return true;
      else return false;
    } else {
      return false;
    }
  }

  /** Go offline */
  async handleSwitchStatus(client: Socket) {
    const userId = client.handshake.query.userId.toString();
    // Save or update client as a player for players info
    let status: any = (
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call(
          'JSON.GET',
          eKeys.PLAYERSINFOS,
          `$.players[?(@.id=="${userId}")].status`,
        )
        .exec()
    )[1][1];
    status = JSON.parse(status)[0];
    if (status === ePlayerStatus.OFFLINE) status = ePlayerStatus.ONLINE;
    if (status === ePlayerStatus.ONLINE) status = ePlayerStatus.OFFLINE;
    await this._savePlayerInfos(userId, { status: status });
    this._sendPlayersInfo();
  }

  /** *********************************************************************** */
  /** SOCKET                                                                  */
  /** *********************************************************************** */

  /** add client to list */
  private async _addOrUpdateClient(client: Socket) {
    const userId = client.handshake.query.userId.toString();
    const isClient = this.clients.find((c) => c.userId === userId);
    if (isClient) isClient.socket == client;
    else this.clients.push(new Client(client, userId));
    // Save or update client as a player for players info
    await this._savePlayerInfos(userId, {
      id: userId,
      status: ePlayerStatus.ONLINE,
      matchmaking: 0,
    });
    this._sendPlayersInfo();
  }

  /** remove client from list */
  private async _removeClient(client: Socket) {
    const userId = client.handshake.query.userId.toString();
    this.clients = this.clients.filter((c) => c.socket.id !== client.id);
    // Save or update client as a player for players info
    await this._savePlayerInfos(userId, {
      id: userId,
      status: ePlayerStatus.OFFLINE,
    });
    this._sendPlayersInfo();
  }

  /** get socket from id */
  private _getSocket(id: string): Socket {
    const client = this.clients.find((c) => c.userId === id);
    if (client) {
      return client.socket;
    }
    return null;
  }

  /** client connection */
  async clientConnection(client: Socket) {
    // get query information
    const userId: string = client.handshake.query.userId.toString();
    const userPic: string = client.handshake.query.pic.toString();
    const userName: string = client.handshake.query.name.toString();
    console.log(`user number : ${userId} (${client.id}) connected !`);
    // Create user in database *************** TO DELETE AFTER TESTS
    try {
      await this.userService.findOne(+userId);
    } catch (e) {
      await this.userService.create({
        id: +userId,
        username: userName,
        email: `${userName}@student.42.fr`,
        profilePicture: userPic,
      });
    }
    // add client to the server list
    await this._addOrUpdateClient(client);
    // if the user id is in a game, reconnect the client to the game
    await this.redis.select(DB.PLAYERS);
    const gameId: any = await this.redis.hget('players', userId);
    if (gameId) {
      client.join(gameId);
      client.emit('reconnect', gameId);
    } else {
      client.join(Params.LOBBY);
      if (this.server)
        this.server.to(Params.LOBBY).emit('info', {
          message: `${userName}, ${nickName()}, joined the lobby`,
        });
    }
  }

  /** client disconnection */
  async clientDisconnection(client: Socket) {
    // get query information
    const userId: string = client.handshake.query.userId.toString();
    const userName: string = client.handshake.query.name.toString();
    console.log(`user : ${userName} disconnected`);
    // Remove client from server
    await this._removeClient(client);
    // Broadcast that user left the lobby
    this.server.to(Params.LOBBY).emit('info', {
      message: `${userName} left the lobby`,
    });
    // Warn the room if the player is in game
    await this.redis.select(DB.PLAYERS);
    const gameId: any = await this.redis.get(userId);
    if (gameId && this.server)
      this.server.to(gameId).emit('info', {
        message: `${userName} has left.`,
        data: { userId: userId },
      });
  }

  /** disconnect old sockets */
  async disconnectOldSockets() {
    this.server.disconnectSockets();
    const data: any = (
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call('JSON.GET', eKeys.PLAYERSINFOS, '$')
        .exec()
    )[1][1];
    if (JSON.parse(data)) {
      const players = JSON.parse(data)[0].players;
      for (const p of players) {
        await this._savePlayerInfos(p.id, { status: ePlayerStatus.OFFLINE });
      }
    }
  }

  /** *********************************************************************** */
  /** GAME LOOP                                                               */
  /** *********************************************************************** */

  /** get game loop interval to do a proper clear interval */
  private _getInterval(id: string): NodeJS.Timer {
    const game = this.gameLoops.find((g) => g.id === id);
    if (game) return game.interval;
    return null;
  }

  /** *********************************************************************** */
  /** GAME                                                                    */
  /** *********************************************************************** */

  /** Add player to a game and set his side */
  private async _addPlayerToGame(
    player: Player,
    side: number,
    game: Game,
    pipeline: ChainableCommander,
  ) {
    // Add it to the game room and leave lobby
    //player.socket.leave(Params.LOBBY);
    player.socket.join(game.id);
    // Add player in player db with its game for further checks
    pipeline.select(DB.PLAYERS).set(player.userId, game.id);
    // Complete information on game db
    pipeline.select(DB.GAMES).call(
      'JSON.ARRAPPEND',
      game.id,
      '$.players',
      JSON.stringify({
        userId: player.userId,
        side: side,
        score: 0,
        pauseCount: 1,
        pic: player.pic,
        name: player.name,
      }),
    );
    // Update players info
    await this._savePlayerInfos(player.userId, {
      status: ePlayerStatus.WAITING,
      matchmaking: ePlayerMatchMakingStatus.IN_GAME,
      game: game.id,
    });
    this._sendPlayersInfo();
  }

  /** Check if a player is already in a game */
  private async _isPlayerInGame(userId: string): Promise<boolean> {
    const res = await this.redis.multi().select(DB.PLAYERS).get(userId).exec();
    return res[1][1] !== null;
  }

  /** Get the side of a player in a game from his id */
  private _getSideOfPlayer(game: Game, userId: string): number {
    const player: Player = game.players.find((p) => p.userId === userId);
    if (!player) throw new PlayerNotFoundException(userId);
    return player.side;
  }

  /** Create the game list from the global server data */
  private async _createGameList(): Promise<Game[]> {
    const keys: any = await this.redis
      .multi()
      .select(DB.GAMES)
      .keys('*')
      .exec();
    let games: any = [];
    let gameKeys: string[] = keys[1][1];
    gameKeys = gameKeys.filter((k: string) => k !== 'ping');
    if (gameKeys.length > 0) {
      games = await this.redis
        .multi()
        .select(DB.GAMES)
        .call('JSON.MGET', ...gameKeys, '$')
        .exec();
      games = games[1][1];
    }
    // filter non json keys
    games = games.filter((g: any) => g);
    // building game list
    const gameList = games.map((gString: any) => {
      const gArr: Game[] = JSON.parse(gString);
      const g: Game = gArr[0];
      return {
        id: g.id,
        players: g.players.map((p: any) => ({
          userId: p.userId,
          pic: p.pic,
          name: p.name,
          score: p.score,
        })),
        viewersCount: g.viewers.length,
      };
    });
    return gameList;
  }

  /** Remove game from storage */
  private async _removeGame(gameId: string) {
    const game: Game = await this._getGame(gameId);
    // create a pipeline for redis commands
    const pipeline = this.redis.pipeline();
    // remove players
    const players: Player[] = game.players;
    pipeline.select(DB.PLAYERS);
    for (let i = 0; i < players.length; ++i) {
      pipeline.del(players[i].userId);
      // Update players info
      await this._savePlayerInfos(players[i].userId, {
        status: ePlayerStatus.ONLINE,
        game: '',
        updated: 1,
        matchmaking: ePlayerMatchMakingStatus.NOT_IN_QUEUE,
      });
      // remove the updated info after 2 seconds to avoid too much updates
      setTimeout(async () => {
        await this._savePlayerInfos(players[i].userId, {
          updated: 0,
        });
      }, 2000);
    }
    // remove viewers
    const viewers: Client[] = game.viewers;
    pipeline.select(DB.VIEWERS);
    for (let i = 0; i < viewers.length; ++i) {
      pipeline.del(viewers[i].userId);
      // Update players info
      await this._savePlayerInfos(viewers[i].userId, {
        status: ePlayerStatus.ONLINE,
        game: '',
      });
    }
    // send players info
    this._sendPlayersInfo();
    // remove the game from the list in storage
    await pipeline.select(DB.GAMES).del(gameId).exec();
  }

  /** Cancel game */
  private async _cancelGame(gameId: string) {
    //this.server.in(gameId).socketsJoin(Params.LOBBY);
    this.server.in(gameId).socketsLeave(gameId);
    // update and send player info
    const userId = (await this._getGame(gameId)).players[0].userId;
    await this._savePlayerInfos(userId, {
      status: ePlayerStatus.ONLINE,
      game: '',
      matchmaking: ePlayerMatchMakingStatus.NOT_IN_QUEUE,
    });
    this._sendPlayersInfo();
    await this._removeGame(gameId);
    // send a fresh gamelist to the lobby
    const gameList = await this._createGameList();
    this.server.to(Params.LOBBY).emit('gameList', gameList);
  }

  /** End a game */
  private async _endGame(
    game: Game,
    motive: number,
    loserId?: string,
  ): Promise<Match> {
    // emit a game end info to all players / viewers so they go back to lobby
    this.server.to(game.id).emit('gameEnd', motive);
    // disconnect players / viewers from game room and connect them to lobby
    this.server.in(game.id).socketsJoin(Params.LOBBY);
    this.server.in(game.id).socketsLeave(game.id);
    // save game result in database
    const createMatchDto: CreateMatchDto = {
      players: game.players.map((p: any) => ({
        playerId: +p.userId,
        side: p.side,
        score: p.score,
        status: p.userId === loserId ? (motive === Motive.ABANDON ? 2 : 1) : 0,
      })),
    };
    // remove the game from the list
    await this._removeGame(game.id);
    // send a fresh gamelist to the lobby
    const gameList = await this._createGameList();
    this.server.to(Params.LOBBY).emit('gameList', gameList);
    // Save result
    try {
      return await this.matchService.create(createMatchDto);
    } catch (e) {
      throw new gameRegistrationException();
    }
  }

  /** get Game */
  private async _getGame(id: string): Promise<any> {
    const game: any = await this.redis
      .multi()
      .select(DB.GAMES)
      .call('JSON.GET', id, '$')
      .exec();
    if (game && game[1] && game[1][1]) return JSON.parse(game[1][1])[0];
    throw new GameNotFoundException(id);
  }

  /** Initialize game */
  private _initGame(game: Game, side: number) {
    if (game.status === Status.CREATED) {
      this._initGameGrid(game);
      this._initGamePhysics(game);
    } else {
      this._resetGamePhysics(game, side);
    }
    this._openPlayersScoreBoard(game);
    this.server.to(game.id).emit('updateScores', this._buildScoreObject(game));
  }

  /** We have a winner */
  private _weHaveALoser(game: Game): string {
    const winner = game.players.find((p) => p.score === 9);
    const loser = game.players.find((p) => p.score < 9);
    if (winner && loser) return loser.userId;
    return '';
  }

  /** Game loop */
  private async _gameLoop(game: Game, interval: NodeJS.Timer) {
    if (game.status === Status.STARTED) {
      this._moveWorldForward(game);
      // check scores and end the game if one player scores 9
      const loserId = this._weHaveALoser(game);
      if (loserId !== '') {
        this._endGame(game, Motive.WIN, loserId);
        clearInterval(interval);
        return;
      }
      this._updateGridFromPhysics(game);
      this.server.to(game.id).emit('updateGrid', game.gameGrid);
      // write in redis
      const isGame = (
        await this.redis.multi().select(DB.GAMES).exists(game.id).exec()
      )[1][1];
      if (isGame) {
        await this.redis
          .multi()
          .select(DB.GAMES)
          .call(
            'JSON.SET',
            game.id,
            '$.gamePhysics.ball',
            JSON.stringify(game.gamePhysics.ball),
          )
          .call('JSON.SET', game.id, '$.players', JSON.stringify(game.players))
          .exec();
      }
    }
  }

  /** Start a game */
  private async _startGame(id: string) {
    let game: Game = await this._getGame(id);
    // Update players info
    for (let i = 0; i < 2; ++i) {
      await this._savePlayerInfos(game.players[i].userId, {
        status: ePlayerStatus.PLAYING,
        game: id,
      });
    }
    this._sendPlayersInfo();
    // game initialization (grid + physics)
    this._initGame(game, Side.RIGHT);
    game.status = Status.STARTED;
    // update game (init + status) in redis
    await this.redis
      .multi()
      .select(DB.GAMES)
      .call('JSON.SET', id, '$', JSON.stringify(game))
      .call('JSON.SET', id, `$.status`, Status.STARTED)
      .exec();
    // game loop
    const gameInterval = setInterval(async () => {
      await this._gameLoop(game, gameInterval);
      game = await this._getGame(game.id);
    }, 30);
    this.gameLoops.push({ id: id, interval: gameInterval });
  }

  /** Create a new game */
  async create(players: Player[]) {
    // Check if one of the user is already in a game or in match making
    for (let i = 0; i < players.length; ++i) {
      if (await this._isPlayerInGame(players[i].userId))
        throw new UserAlreadyInGameException(players[i].userId);
      const isMatchMaking = (
        await this.redis
          .multi()
          .select(DB.MATCHMAKING)
          .sismember('users', players[i].userId)
          .exec()
      )[1][1];
      if (isMatchMaking) {
        await this.redis
          .multi()
          .select(DB.MATCHMAKING)
          .srem('users', players[i].userId)
          .exec();
        await this._savePlayerInfos(players[i].userId, { matchmaking: 0 });
        this._sendPlayersInfo();
      }
    }
    // create a new game
    const newGame: Game = new Game(v4());
    // create a game pipeline for redis
    const pipeline = this.redis.pipeline();
    // Add new game to pipeline
    pipeline
      .select(DB.GAMES)
      .call('JSON.SET', newGame.id, '$', JSON.stringify(newGame));
    // add players to the game and give them the game id
    for (let i = 0; i < players.length; ++i) {
      const side: number = i ? Side.RIGHT : Side.LEFT;
      await this._addPlayerToGame(players[i], side, newGame, pipeline);
      this._getSocket(players[i].userId).emit('gameId', { id: newGame.id });
    }
    // update game on redis
    await pipeline.exec();
    // Broadcast new gamelist to the lobby
    const gameList = await this._createGameList();
    this.server.to(Params.LOBBY).emit('gameList', gameList);
    // start game if players > 1
    if (players.length > 1) await this._startGame(newGame.id);
  }

  /** Find all created games */
  async findAll(client: Socket) {
    const gameList = await this._createGameList();
    client.emit('gameList', gameList);
  }

  /** one viewer leave the game */
  async viewerLeaves(client: Socket, id: string) {
    // remove the viewer
    const userId: string = client.handshake.query.userId.toString();
    await this.redis
      .multi()
      .select(DB.GAMES)
      .call('JSON.DEL', id, `$.viewers[?(@.userId=="${userId}")]`)
      .select(DB.VIEWERS)
      .del(userId)
      .exec();
    // quit room and join lobby
    client.leave(id);
    //client.join(Params.LOBBY);
    // resend game list to lobby
    const gameList = await this._createGameList();
    this.server.to(Params.LOBBY).emit('gameList', gameList);
    // update and send player info
    await this._savePlayerInfos(userId, {
      status: ePlayerStatus.ONLINE,
      game: '',
    });
    this._sendPlayersInfo();
  }

  /** one player abandons the game */
  async abandonGame(client: Socket, id: string): Promise<Match> {
    const game: Game = await this._getGame(id);
    const userId: string = client.handshake.query.userId.toString();
    // clear the game loop if exists
    const interval = this._getInterval(id);
    if (interval) clearInterval(interval);
    if (game.players.length > 1)
      return await this._endGame(game, Motive.ABANDON, userId);
    else await this._cancelGame(id);
  }

  /** pause a game */
  async pause(client: Socket, id: string) {
    // Get game and player
    const game: Game = await this._getGame(id);
    const userId: string = client.handshake.query.userId.toString();
    const player: Player = game.players.find((p) => p.userId === userId);
    // check if game is already paused
    if (game.status === Status.PAUSED)
      throw new CannotPauseGameException('the game is already paused');
    // check if user can pause the game
    if (player.pauseCount === 0) {
      throw new CannotPauseGameException('you have used all your pauses');
    }
    // Pause the game and unpause it after a delay with a callback
    game.players.map((p) =>
      p.userId === userId ? { ...p, pauseCount: --p.pauseCount } : p,
    );
    const ballSpeed = game.gamePhysics.ball.speed;
    // update redis
    await this.redis
      .multi()
      .select(DB.GAMES)
      .call('JSON.SET', id, '$.players', JSON.stringify(game.players))
      .call('JSON.SET', id, '$.status', Status.PAUSED)
      .exec();
    this.server.to(id).emit('pause', +Params.PAUSE_TIME);
    // UnPause after a delay
    setTimeout(async () => {
      const isGame = (
        await this.redis.multi().select(DB.GAMES).exists(id).exec()
      )[1][1];
      if (isGame) {
        await this.redis
          .multi()
          .select(DB.GAMES)
          .call('JSON.SET', id, '$.status', Status.STARTED)
          .call('JSON.SET', id, '$.gamePhysics.ball.speed', ballSpeed)
          .exec();
      }
    }, Params.PAUSE_TIME * 1000);
  }

  /** join a game (player) */
  async join(client: Socket, id: string) {
    // get game
    const game: Game = await this._getGame(id);
    // get pipeline
    const pipeline = this.redis.pipeline();
    // remove user from matchmaking
    const userId: string = client.handshake.query.userId.toString();
    const isMatchMaking = (
      await this.redis
        .multi()
        .select(DB.MATCHMAKING)
        .sismember('users', userId)
        .exec()
    )[1][1];
    if (isMatchMaking)
      await this.redis
        .multi()
        .select(DB.MATCHMAKING)
        .srem('users', userId)
        .exec();
    // add new player to the game and emit new grid
    this._addPlayerToGame(
      new Player(client, userId),
      Side.RIGHT,
      game,
      pipeline,
    );
    // update redis
    await pipeline.exec();
    // Start game
    await this._startGame(id);
    // update the lobby with the new player
    const gameList = await this._createGameList();
    this.server.to(Params.LOBBY).emit('gameList', gameList);
  }

  /** view a game (viewer) */
  async view(client: Socket, id: string) {
    const userId: string = client.handshake.query.userId.toString();
    // create a temp pipeline to group commands
    const pipeline = this.redis.pipeline();
    // Add the user as a viewer
    pipeline.select(DB.VIEWERS).set(userId, id);
    // Complete information on game db
    const isGame = (
      await this.redis.multi().select(DB.GAMES).exists(id).exec()
    )[1][1];
    if (isGame) {
      pipeline
        .select(DB.GAMES)
        .call(
          'JSON.ARRAPPEND',
          id,
          `$.viewers`,
          JSON.stringify({ userId: userId }),
        );
    }
    client.join(id);
    //client.leave(Params.LOBBY);
    // update redis
    await pipeline.exec();
    // send a fresh gamelist to the lobby
    const gameList = await this._createGameList();
    this.server.to(Params.LOBBY).emit('gameList', gameList);
    // update and send player info
    await this._savePlayerInfos(userId, {
      status: ePlayerStatus.SPECTATING,
      game: id,
    });
    this._sendPlayersInfo();
  }

  /** continue a game after a server reboot */
  async continue(client: Socket, id: string) {
    // check if there is a game loop for this game already
    if (!this.gameLoops.find((gl) => gl.id === id)) {
      let game: Game = await this._getGame(id);
      // force status to Started (in case the game is paused)
      await this.redis
        .multi()
        .select(DB.GAMES)
        .call('JSON.SET', id, `$.status`, Status.STARTED)
        .exec();
      // reinit grid and physics to restore ball interval
      this._initGame(game, Side.RIGHT);
      // new game loop
      const gameInterval = setInterval(async () => {
        await this._gameLoop(game, gameInterval);
        game = await this._getGame(game.id);
      }, 30);
      this.gameLoops.push({ id: id, interval: gameInterval });
    }
  }

  /** *********************************************************************** */
  /** MATCHMAKING                                                             */
  /** *********************************************************************** */

  /** handle player joining or leaving matchmaking */
  async handleMatchMaking(client: Socket, value: boolean) {
    console.log(value);
    // create a temp pipeline to group commands
    const pipeline = this.redis.pipeline();
    // add or remove the player
    const userId: string = client.handshake.query.userId.toString();
    pipeline.select(DB.MATCHMAKING);
    if (value) {
      pipeline.sadd('users', userId);
      // update players info
      await this._savePlayerInfos(userId, { matchmaking: 1 });
    }
    if (!value) {
      pipeline.exists('users');
      if ((await pipeline.exec())[1][1]) {
        pipeline.srem('users', userId);
      } else return;
      await this._savePlayerInfos(userId, { matchmaking: 0 });
    }
    this._sendPlayersInfo();
    await pipeline.exec();
    // MaaaaatchMakiiiing
    let result: any = await this.redis
      .multi()
      .select(DB.MATCHMAKING)
      .smembers('users')
      .exec();
    result = result[1][1];
    for (let i = 0; i + 2 <= result.length; i += 2) {
      // Create a match with the two players
      const users: any = await this.redis
        .multi()
        .select(DB.MATCHMAKING)
        .spop('users')
        .spop('users')
        .exec();
      const p1 = users[1][1];
      const p2 = users[2][1];
      const playersToMatch = [];
      await this._savePlayerInfos(p1, { matchmaking: 2 });
      await this._savePlayerInfos(p2, { matchmaking: 2 });
      playersToMatch.push({ userId: p1, socket: this._getSocket(p1) });
      playersToMatch.push({ userId: p2, socket: this._getSocket(p2) });
      playersToMatch.forEach((p) => {
        this._getSocket(p.userId).emit('opponentFound');
      });
      setTimeout(() => {
        this.create(playersToMatch);
      }, 2000);
    }
    this._sendPlayersInfo();
  }

  /** *********************************************************************** */
  /** GAME GRID                                                               */
  /** *********************************************************************** */

  /** Init game grid */
  private _initGameGrid(game: Game) {
    // Players
    game.players.forEach((p: any) => {
      game.gameGrid.players.push({
        coordinates: {
          x: p.side === Side.LEFT ? 0 : Params.CANVASW - Params.BARWIDTH,
          y: Params.CANVASH / 2 - Params.BARHEIGHT / 2,
        },
        side: p.side,
      });
    });
    // Ball
    game.gameGrid.ball = new Vector(Params.CANVASW / 2, Params.CANVASH / 2);
    // Walls
    [
      {
        coordinates: { x: 0, y: 0 },
        side: Wall.TOP,
      },
      {
        coordinates: { x: 0, y: Params.CANVASH - Params.WALLSIZE },
        side: Wall.BOTTOM,
      },
    ].forEach((wall) => game.gameGrid.walls.push(wall));
  }

  /** Update grid from physics */
  private _updateGridFromPhysics(game: Game) {
    // Players
    game.gamePhysics.players.forEach((playerPhy) => {
      game.gameGrid.players.forEach((playerGrid, index) => {
        if (playerGrid.side === playerPhy.side)
          game.gameGrid.players[index].coordinates = playerPhy.coordinates;
      });
    });
    // Ball
    game.gameGrid.ball = game.gamePhysics.ball.coordinates;
  }

  /** get game grid on request */
  async getGameGrid(client: Socket, id: string) {
    // read from redis
    const game: Game = await this._getGame(id);
    client.emit('updateGrid', game.gameGrid);
    client.emit('updateScores', this._buildScoreObject(game));
    if (game.status === Status.PAUSED) throw new gameIsPausedException();
  }

  /** *********************************************************************** */
  /** SCORES                                                                  */
  /** *********************************************************************** */

  /** Build a score object from a game */
  private _buildScoreObject(game: Game): any[] {
    const scores = game.players.map((player) => ({
      side: player.side,
      score: player.score,
      name: player.name,
    }));
    return scores;
  }

  /** Increase score for player */
  private _updateScore(side: number, game: Game) {
    game.players = game.players.map((player) =>
      player.side === side && player.updating === false
        ? { ...player, score: ++player.score, updating: true }
        : player,
    );
    this.server.to(Params.LOBBY).emit('scoreUpdate', {
      id: game.id,
      players: game.players.map((p: any) => ({
        userId: p.userId,
        pic: p.pic,
        name: p.name,
        score: p.score,
      })),
    });
  }

  /** Open scores for update */
  private _openPlayersScoreBoard(game: Game) {
    game.players = game.players.map((player) => ({
      ...player,
      updating: false,
    }));
  }

  /** *********************************************************************** */
  /** PHYSICS                                                                 */
  /** *********************************************************************** */

  /** Init game physics */
  private _initGamePhysics(game: Game) {
    // Players
    game.players.forEach((p: any) => {
      const pX = p.side === Side.RIGHT ? Params.CANVASW - Params.BARWIDTH : 0;
      game.gamePhysics.players.push({
        coordinates: {
          x: pX,
          y: Params.CANVASH / 2 - Params.BARHEIGHT / 2,
        },
        dimensions: { h: Params.BARHEIGHT, w: Params.BARWIDTH },
        direction: { x: 0, y: 1 },
        speed: 0,
        side: p.side,
        type: Body.PADDLE,
      });
    });
    // Walls
    [
      {
        coordinates: { x: 0, y: 0 },
        dimensions: { h: Params.WALLSIZE, w: Params.CANVASW },
        direction: { x: 1, y: 0 },
        side: Wall.TOP,
        type: Body.WALL,
      },
      {
        coordinates: { x: 0, y: Params.CANVASH - Params.WALLSIZE },
        dimensions: { h: Params.WALLSIZE, w: Params.CANVASW },
        direction: { x: 1, y: 0 },
        side: Wall.BOTTOM,
        type: Body.WALL,
      },
    ].forEach((wall) => game.gamePhysics.walls.push(wall));
    // Goals
    [
      {
        coordinates: { x: -Params.WALLSIZE, y: 0 },
        dimensions: { h: Params.CANVASH, w: Params.WALLSIZE },
        side: Side.LEFT,
        type: Body.GOAL,
      },
      {
        coordinates: { x: Params.CANVASW, y: 0 },
        dimensions: { h: Params.CANVASH, w: Params.WALLSIZE },
        side: Side.RIGHT,
        type: Body.GOAL,
      },
    ].forEach((goal) => game.gamePhysics.goals.push(goal));
    // Ball
    const startingSide = Math.round(Math.random());
    game.gamePhysics.ball.type = Body.BALL;
    game.gamePhysics.ball.coordinates = {
      x:
        startingSide === 0
          ? Params.BARWIDTH + 10
          : Params.CANVASW - Params.BARWIDTH - 10,
      y: Math.floor(
        Math.random() *
          (Params.CANVASH -
            Params.WALLSIZE -
            Params.BALLSIZE -
            Params.WALLSIZE +
            1) +
          Params.WALLSIZE,
      ),
    };
    game.gamePhysics.ball.dimensions = {
      w: Params.BALLSIZE,
      h: Params.BALLSIZE,
    };
    // Ball initial direction and speed
    game.gamePhysics.ball.direction = {
      x: startingSide === 0 ? 1 : -1,
      y: Math.random(),
    };
    game.gamePhysics.ball.speed = Params.BALLSPEED;
    // Accelerate the ball every xx seconds
    let interval = this.ballIntervals.find((i) => i.game === game.id);
    if (interval) clearInterval(interval.interval);
    else {
      const len = this.ballIntervals.push({ game: game.id });
      interval = this.ballIntervals[len - 1];
    }
    interval.interval = setInterval(() => {
      this._accelerateBall(game);
    }, Params.BALL_ACCELERATION_TIME * 1000);
  }

  /** Reset game physics */
  private _resetGamePhysics(game: Game, side: number) {
    // Ball
    game.gamePhysics.ball.coordinates = {
      x:
        side === Side.RIGHT
          ? Params.BARWIDTH + 10
          : Params.CANVASW - Params.BARWIDTH - 10,
      y: Math.floor(
        Math.random() *
          (Params.CANVASH -
            Params.WALLSIZE -
            Params.BALLSIZE -
            Params.WALLSIZE +
            1) +
          Params.WALLSIZE,
      ),
    };
    // Ball initial direction and speed
    game.gamePhysics.ball.direction = {
      x: side === Side.RIGHT ? 1 : -1,
      y: Math.random(),
    };
    game.gamePhysics.ball.speed = Params.BALLSPEED;
    // Accelerate the ball every xx seconds
    let interval = this.ballIntervals.find((i) => i.game === game.id);
    if (interval) clearInterval(interval.interval);
    else {
      const len = this.ballIntervals.push({ game: game.id });
      interval = this.ballIntervals[len - 1];
    }
    interval.interval = setInterval(() => {
      this._accelerateBall(game);
    }, Params.BALL_ACCELERATION_TIME * 1000);
  }

  /** Accelerate ball */
  private _accelerateBall(game: Game) {
    if (game.gamePhysics.ball.speed < Params.BALL_MAX_SPEED)
      game.gamePhysics.ball.speed += 1;
  }

  /** Detect collision between 2 physic objects */
  private _isCollision(object1: Physic, object2: Physic): boolean {
    const { x: x1, y: y1 } = object1.coordinates;
    const { x: x2, y: y2 } = object2.coordinates;
    const { h: h1, w: w1 } = object1.dimensions;
    const { h: h2, w: w2 } = object2.dimensions;
    if (x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && h1 + y1 > y2) {
      return true;
    }
    return false;
  }

  /** Bounce a physic object by changing its vector */
  private _bounce(object: Physic, surface?: Physic): Physic {
    let updatedObject: Physic;

    if (object.type === Body.PADDLE) {
      updatedObject = {
        ...object,
        direction: {
          x: 0,
          y: object.direction.y * -1,
        },
      };
    } else if (object.type === Body.BALL) {
      // Ball
      const newDir: Vector = object.direction;
      // vs Wall
      if (surface.direction.x === 1) newDir.y = newDir.y * -1;
      // vs Paddle
      if (surface.direction.x === 0) newDir.x = newDir.x * -1;
      // Acceleration by contact
      if (surface.speed) newDir.y += surface.direction.y / 5;
      updatedObject = {
        ...object,
        direction: newDir,
      };
    }
    return updatedObject;
  }

  /** Update the physics from player's move */
  private _movePaddleFromInput(game: Game, side: number, input: number) {
    // get the correct paddle
    const playerIndex = game.gamePhysics.players.findIndex(
      (player) => player.side === side,
    );
    const paddle: Physic = game.gamePhysics.players[playerIndex];
    // calculate the move to apply
    const move: number =
      input === Move.UP ? Params.PLAYERSPEED * -1 : Params.PLAYERSPEED;
    // handle possible collision
    let updatedPaddle: Physic = this._getUpdatedObject(paddle, move);
    if (this._isCollision(updatedPaddle, game.gamePhysics.walls[Wall.TOP])) {
      updatedPaddle = {
        ...paddle,
        coordinates: {
          x: paddle.coordinates.x,
          y: Params.WALLSIZE + 1,
        },
      };
    } else if (
      this._isCollision(updatedPaddle, game.gamePhysics.walls[Wall.BOTTOM])
    ) {
      updatedPaddle = {
        ...paddle,
        coordinates: {
          x: paddle.coordinates.x,
          y: Params.CANVASH - Params.WALLSIZE - 1 - Params.BARHEIGHT,
        },
      };
    }
    game.gamePhysics.players[playerIndex] = updatedPaddle;
  }

  /** Get updated object */
  private _getUpdatedObject(object: Physic, input?: number): Physic {
    let updated: Physic;
    // Players
    const move = input ? input : object.speed * object.direction.y;
    if (object.type === Body.PADDLE) {
      updated = {
        ...object,
        coordinates: {
          x: object.coordinates.x,
          y: object.coordinates.y + move,
        },
        speed: input
          ? Params.PLAYERSPEED
          : object.speed - 1 > 0
          ? object.speed - 1
          : 0,
        direction: {
          x: 0,
          y: input ? (input > 0 ? 1 : -1) : object.direction.y,
        },
      };
    }
    // Ball
    if (object.type === Body.BALL) {
      updated = {
        ...object,
        coordinates: {
          x: object.coordinates.x + object.speed * object.direction.x,
          y: object.coordinates.y + object.speed * object.direction.y,
        },
      };
    }
    return updated;
  }

  /** Move the paddle forward with its speed and direction */
  private _movePaddleForward(paddle: Physic, world: GamePhysics): Physic {
    let updatedPaddle: Physic = this._getUpdatedObject(paddle);
    if (
      this._isCollision(updatedPaddle, world.walls[Wall.TOP]) ||
      this._isCollision(updatedPaddle, world.walls[Wall.BOTTOM])
    ) {
      updatedPaddle = this._bounce(paddle);
    }
    return updatedPaddle;
  }

  /** Move the ball forward with its speed and direction */
  private _moveBallForward(ball: Physic, game: Game): Physic {
    const world: GamePhysics = game.gamePhysics;
    let updatedBall: Physic = this._getUpdatedObject(ball);
    // if a goal is hit
    if (this._isCollision(updatedBall, world.goals[Side.LEFT])) {
      // score for right player
      this._updateScore(Side.RIGHT, game);
      this._initGame(game, Side.LEFT);
      return game.gamePhysics.ball;
    } else if (this._isCollision(updatedBall, world.goals[Side.RIGHT])) {
      // score for left player
      this._updateScore(Side.LEFT, game);
      this._initGame(game, Side.RIGHT);
      return game.gamePhysics.ball;
    }
    // if a wall or paddle is hit
    if (this._isCollision(updatedBall, world.walls[Wall.TOP]))
      updatedBall = this._bounce(ball, world.walls[Wall.TOP]);
    else if (this._isCollision(updatedBall, world.walls[Wall.BOTTOM]))
      updatedBall = this._bounce(ball, world.walls[Wall.BOTTOM]);
    else if (this._isCollision(updatedBall, world.players[Side.LEFT]))
      updatedBall = this._bounce(ball, world.players[Side.LEFT]);
    else if (this._isCollision(updatedBall, world.players[Side.RIGHT]))
      updatedBall = this._bounce(ball, world.players[Side.RIGHT]);
    return updatedBall;
  }

  /** Move the ball and players according to directions and speed */
  private _moveWorldForward(game: Game) {
    // Players
    const players: Physic[] = game.gamePhysics.players.map((p) =>
      this._movePaddleForward(p, game.gamePhysics),
    );
    game.gamePhysics.players = players;
    // Ball
    const ball: Physic = this._moveBallForward(game.gamePhysics.ball, game);
    game.gamePhysics.ball = ball;
  }

  /** update a game (moves) */
  async update(client: Socket, id: string, move: number) {
    // read from redis
    const game: Game = await this._getGame(id);
    // Update player position if game started
    if (game.status === Status.STARTED) {
      // Update move
      const userId: string = client.handshake.query.userId.toString();
      const side: number = this._getSideOfPlayer(game, userId);
      this._movePaddleFromInput(game, side, move);
      // write in redis
      await this.redis
        .multi()
        .select(DB.GAMES)
        .call(
          'JSON.SET',
          id,
          `$.gamePhysics.players[?(@.side==${side})]`,
          JSON.stringify(game.gamePhysics.players.find((p) => p.side === side)),
        )
        .exec();
    }
  }

  /** *********************************************************************** */
  /** PLAYERS INFO                                                            */
  /** *********************************************************************** */

  /** returns player info to requester */
  async handlePlayersInfos(client: Socket) {
    const data: any = (
      await this.redis
        .multi()
        .select(DB.PLAYERSINFOS)
        .call('JSON.GET', eKeys.PLAYERSINFOS, '$')
        .exec()
    )[1][1];
    if (data) client.emit(eKeys.PLAYERSINFOS, JSON.parse(data)[0]);
  }

  /** *********************************************************************** */
  /** CHALLENGE                                                               */
  /** *********************************************************************** */

  async handleCreateChallenge(client: Socket, id: string) {
    // get both players
    const userId: string = client.handshake.query.userId.toString();
    const challenger = this.clients.find((c) => c.userId === userId);
    if (!challenger) throw new PlayerNotFoundException(userId);
    const challengee = this.clients.find((c) => c.userId === id);
    if (!challengee) throw new PlayerNotFoundException(userId);
    // update their status and broadcast it
    await this._savePlayerInfos(challenger.userId, {
      status: ePlayerStatus.CHALLENGE,
    });
    await this._savePlayerInfos(challengee.userId, {
      status: ePlayerStatus.CHALLENGE,
    });
    this._sendPlayersInfo();
    // switch back to online if status is still challenge after challenge timer
    setTimeout(async () => {
      for (const player of [challenger, challengee])
        if (
          await this._checkPlayerInfo(
            player.userId,
            'status',
            ePlayerStatus.CHALLENGE,
          )
        ) {
          await this._savePlayerInfos(player.userId, {
            status: ePlayerStatus.ONLINE,
          });
          this._sendPlayersInfo();
        }
    }, Params.CHALLENGE_TIMER * 1000);
    // send back information to both through socket to inform them
    const gameChallenge = {
      challenger: {
        name: challenger.name,
        userId: challenger.userId,
        pic: challenger.pic,
      },
      challengee: {
        name: challengee.name,
        userId: challengee.userId,
        pic: challengee.pic,
      },
      timer: Params.CHALLENGE_TIMER,
      status: eChallengeStatus.OPEN,
    };
    challenger.socket.emit('gameChallenge', {
      who: eChallengeWho.CHALLENGER,
      ...gameChallenge,
    });
    challengee.socket.emit('gameChallenge', {
      who: eChallengeWho.CHALLENGEE,
      ...gameChallenge,
    });
  }

  async handleUpdateChallenge(client: Socket, id: string, status: number) {
    // get the user and the opponent
    const userId: string = client.handshake.query.userId.toString();
    const opponent = this.clients.find((c) => c.userId === id);
    let resultingStatus: ePlayerStatus = ePlayerStatus.ONLINE;
    if (!opponent) throw new PlayerNotFoundException(userId);
    // canceled
    if (status === eChallengeStatus.CANCEL) {
      opponent.socket.emit('gameChallengeReply', {
        status: eChallengeStatus.CANCEL,
      });
    }
    // refused
    if (status === eChallengeStatus.REFUSED) {
      opponent.socket.emit('gameChallengeReply', {
        status: eChallengeStatus.REFUSED,
      });
    }
    // accepted
    if (status === eChallengeStatus.ACCEPTED) {
      resultingStatus = ePlayerStatus.WAITING;
      opponent.socket.emit('gameChallengeReply', {
        status: eChallengeStatus.ACCEPTED,
      });
      // create a match and launch it
      const playersToMatch = [];
      playersToMatch.push({
        userId: opponent.userId,
        socket: this._getSocket(opponent.userId),
      });
      playersToMatch.push({ userId: userId, socket: client });
      setTimeout(() => {
        this.create(playersToMatch);
      }, 2000);
    }
    // update players status and broadcast it
    await this._savePlayerInfos(opponent.userId, {
      status: resultingStatus,
    });
    await this._savePlayerInfos(userId, {
      status: resultingStatus,
    });
    this._sendPlayersInfo();
  }
}
