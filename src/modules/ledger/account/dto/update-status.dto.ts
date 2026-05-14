import { IsInt, Min } from 'class-validator';

export class UpdateStatusDto {
  @IsInt()
  @Min(0)
  version!: number;
}
