import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
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
  async login(email: string, password: string) {
    // 1.查找用户
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    // 2.验证密码
    // bcrypt.compare(用户输入的明文，数据库里的hash)
    // 它会自动提取 hash 中的盐，对明文做同样的哈希，然后比较
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    // 3.签发 JWT
    // payload 是存在 token 里的数据，前端解码 token 就能拿到
    // sub 是 JWT 标准字段名，代码 subject（主体）就是用户ID
    // 不要在 payload 里放密码等敏感信息，因为 JWT 只是base64 编码，不是加密
    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);
    // 4.返回 token 和用户信息
    // 前端拿到 access_token 后存到 localStorage 或 内存
    // 后续每个请求在 Header 里带上 Authorization：Bearer<token>
    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        avatar: user.avatar,
      },
    };
  }
}
