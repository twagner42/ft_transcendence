import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Credentials, Friendship, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  FtRegisterUserDto,
  LocalRegisterUserDto,
} from '../auth/dto/registerUser.dto';
import {
  NoUsersInDatabaseException,
  UserAlreadyExistsException,
  UserNotFoundException,
} from './exceptions/user-exceptions';
import { CreateFriendshipDto } from './dto/create-friendship.dto';
import { FriendshipAlreadyExistsException, FriendshipRejectedException } from './exceptions/friendship-exceptions';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const maybeUser = await this.prisma.user.findUnique({
      where: { username: createUserDto.username },
    });
    if (maybeUser != null)
      throw new UserAlreadyExistsException(createUserDto.username);
    const userStat = { wins: 0, losses: 0 };
    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        stats: {
          create: userStat,
        },
      },
    });
    return user;
  }

  async findAll(paginationQuery: PaginationQueryDto): Promise<User[]> {
    const { limit, offset } = paginationQuery;
    const query = {
      ...(limit && { take: +limit }),
      ...(offset && { skip: +offset }),
    };
    const result: User[] = await this.prisma.user.findMany(query);
    if (result.length == 0) throw new NoUsersInDatabaseException();
    return result;
  }

  async findOne(id: number): Promise<User> {
    const result: User | null = await this.prisma.user.findUnique({
      where: { id: id },
    });
    if (result == null) throw new UserNotFoundException(id);
    return result;
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      const result: User = await this.prisma.user.update({
        where: { id: id },
        data: { ...updateUserDto },
      });
      return result;
    } catch (e) {
      throw new UserNotFoundException(id);
    }
  }

  async remove(id: number): Promise<User> {
    try {
      const result: User = await this.prisma.user.delete({
        where: { id: id },
      });
      return result;
    } catch (e) {
      throw new UserNotFoundException(id);
    }
  }

  async getUserCredentialsByEmail(email: string): Promise<Credentials> {
    try {
      const user = await this.prisma.credentials.findUnique({
        where: {
          email: email,
        },
      });
      return user;
    } catch (err) {
      return null;
    }
  }

  async getUserCredentialsByUsername(username: string): Promise<Credentials> {
    try {
      const user = await this.prisma.credentials.findUnique({
        where: {
          username: username,
        },
      });
      return user;
    } catch (err) {
      return null;
    }
  }

  async getUserByEmail(email: string): Promise<User> {
    const user: User | null = await this.prisma.user.findUnique({
      where: {
        email: email,
      },
    });
    return user;
  }

  async createUserWithoutCredentials(
    userInfo: FtRegisterUserDto,
  ): Promise<User> {
    const user: User = await this.prisma.user.create({
      data: {
        email: userInfo.email,
        username: userInfo.username,
        profilePicture: userInfo.profile_image_url,
      },
    });
    return user;
  }

  async createUserWithCredentials(
    userInfo: LocalRegisterUserDto,
    hash: string,
  ): Promise<User> {
    const user: User = await this.prisma.user.create({
      data: {
        email: userInfo.email,
        username: userInfo.username,
        credentials: {
          create: {
            username: userInfo.username,
            email: userInfo.email,
            password: hash,
          },
        },
      },
    });
    return user;
  }

  async createFriendship(
    createFriendshipDto: CreateFriendshipDto,
  ): Promise<Friendship> {
    const maybeFriendship = await this.prisma.friendship.findMany({
      where: {
        OR: [
          {
            requesterId: createFriendshipDto.requesterId,
            addresseeId: createFriendshipDto.addresseeId,
          },
          {
            requesterId: createFriendshipDto.addresseeId,
            addresseeId: createFriendshipDto.requesterId,
          },
        ],
      },
    });
    if (maybeFriendship.length !== 0) {
      // Already friends
      if (maybeFriendship[0].status === 1)
        throw new FriendshipAlreadyExistsException(
          createFriendshipDto.requesterId,
          createFriendshipDto.addresseeId,
        );
      // Friendship rejected once
      if (
        maybeFriendship[0].status === 0 &&
        maybeFriendship[0].addresseeId === createFriendshipDto.addresseeId
      )
        throw new FriendshipRejectedException(
          createFriendshipDto.requesterId,
          createFriendshipDto.addresseeId,
        );
      if (
        maybeFriendship[0].status === 0 &&
        maybeFriendship[0].addresseeId === createFriendshipDto.requesterId
      )
        throw new FriendshipRejectedException(
          createFriendshipDto.requesterId,
          createFriendshipDto.addresseeId,
        );
      // accept if dto requester === addressee + update status to accepted
      // already exists if dto requester === requester
      // already exists if status === accepted
      // rejected if requester === requester and status === rejected
    }
    throw new UserAlreadyExistsException(createUserDto.username);
    const userStat = { wins: 0, losses: 0 };
    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        stats: {
          create: userStat,
        },
      },
    });
    return user;
  }
}
