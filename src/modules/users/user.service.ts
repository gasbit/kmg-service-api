import { UserRepository } from "./user.repository";

export class UserService {
  constructor(private readonly userRepository = new UserRepository()) {}

  findById(id: bigint) {
    return this.userRepository.findById(id);
  }
}
