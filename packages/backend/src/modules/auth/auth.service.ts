import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  // 注册
  async register(email: string, password: string, nickname: string) {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('邮箱已注册');
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const user = this.userRepo.create({
      email,
      password: hashPassword,
      nickname,
    });
    await this.userRepo.save(user);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pwd, ...result } = user;
    return result;
  }

  // 登陆
  // async login(email: string, password: string) {
  //   // 1.查找用户
  //   // 2.验证密码
  //   // 3.签发 JWT
  //   // 4.返回 token 和用户信息
  // }
}
