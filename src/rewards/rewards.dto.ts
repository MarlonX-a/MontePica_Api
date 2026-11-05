import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class RewardCreateDto {
  @ApiProperty({ minLength: 1, maxLength: 160 }) @Transform(trim) @IsString() @Length(1,160) name: string;
  @ApiPropertyOptional({ maxLength: 500 }) @ValidateIf((_o,v)=>v!==undefined) @Transform(trim) @IsString() @Length(0,500) description?: string;
  @ApiProperty({ format:'uuid' }) @IsUUID() productId: string;
  @ApiProperty({ minimum:1, maximum:Number.MAX_SAFE_INTEGER }) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) pointsCost: number;
  @ApiProperty() @IsBoolean() active: boolean;
  @ApiProperty({ minimum:0, maximum:2147483647 }) @IsInt() @Min(0) @Max(2147483647) sortOrder: number;
}
export class RewardUpdateDto {
  @ApiProperty({ minimum:1 }) @IsInt() @Min(1) expectedVersion: number;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional({ minLength:1,maxLength:160 }) @Transform(trim) @IsString() @Length(1,160) name?: string;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional({ maxLength:500 }) @Transform(trim) @IsString() @Length(0,500) description?: string;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional({minimum:1,maximum:Number.MAX_SAFE_INTEGER}) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) pointsCost?: number;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional() @IsBoolean() active?: boolean;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional({minimum:0,maximum:2147483647}) @IsInt() @Min(0) @Max(2147483647) sortOrder?: number;
}
export class CreateRedemptionDto {
  @ApiProperty({format:'uuid'}) @IsUUID() rewardId: string;
  @ApiProperty({minimum:1}) @IsInt() @Min(1) rewardVersion: number;
}
export class RejectRedemptionDto {
  @ApiProperty({minLength:1,maxLength:500}) @Transform(trim) @IsString() @Length(1,500) reason: string;
}
export class RedemptionListDto {
  @ApiPropertyOptional({default:1}) @Type(()=>Number) @IsInt() @Min(1) @Max(2147483647) page=1;
  @ApiPropertyOptional({default:20,maximum:100}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional({enum:['pending','approved','rejected','cancelled','expired']}) @IsIn(['pending','approved','rejected','cancelled','expired']) status?:string;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional({format:'uuid'}) @IsUUID() visitId?:string;
}
export class AdminRedemptionListDto extends RedemptionListDto {
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional({format:'uuid'}) @IsUUID() clientId?:string;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional({format:'uuid'}) @IsUUID() operatingDayId?:string;
}
export class RewardListDto {
  @ApiPropertyOptional({default:1}) @Type(()=>Number) @IsInt() @Min(1) @Max(2147483647) page=1;
  @ApiPropertyOptional({default:20,maximum:100}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional() @Transform(trim) @IsString() @Length(1,160) search?:string;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional() @Transform(({value})=>value==='true'?true:value==='false'?false:value) @IsBoolean() active?:boolean;
  @ValidateIf((_o,v)=>v!==undefined) @ApiPropertyOptional({format:'uuid'}) @IsUUID() productId?:string;
}
export class RewardResponseDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty() name:string;
  @ApiProperty({type:String,nullable:true}) description:string|null;
  @ApiProperty({format:'uuid'}) productId:string;
  @ApiProperty() productName:string;
  @ApiProperty() productPriceCents:number;
  @ApiProperty() tracksInventory:boolean;
  @ApiProperty() pointsCost:number;
  @ApiProperty() active:boolean;
  @ApiProperty() sortOrder:number;
  @ApiProperty() version:number;
  @ApiProperty({format:'date-time'}) createdAt:string;
  @ApiProperty({format:'date-time'}) updatedAt:string;
}
export class RewardPageDto {
  @ApiProperty({type:[RewardResponseDto]}) items:RewardResponseDto[];
  @ApiProperty() total:number; @ApiProperty() page:number; @ApiProperty() limit:number;
}
export class RedemptionHistoryDto {
  @ApiProperty() event:string;
  @ApiProperty({type:String,format:'uuid',nullable:true}) actorUserId:string|null;
  @ApiProperty() detail:Record<string,unknown>;
  @ApiProperty({format:'date-time'}) occurredAt:string;
}
export class RedemptionResponseDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty({format:'uuid'}) clientId:string;
  @ApiProperty({format:'uuid'}) participantId:string;
  @ApiProperty({format:'uuid'}) accountId:string;
  @ApiProperty({format:'uuid'}) visitId:string;
  @ApiProperty({format:'uuid'}) operatingDayId:string;
  @ApiProperty({format:'uuid'}) rewardId:string;
  @ApiProperty() rewardVersion:number;
  @ApiProperty({format:'uuid'}) productId:string;
  @ApiProperty() rewardName:string;
  @ApiProperty() productName:string;
  @ApiProperty() pointsCost:number;
  @ApiProperty({enum:['pending','approved','rejected','cancelled','expired']}) status:string;
  @ApiProperty({format:'date-time'}) expiresAt:string;
  @ApiProperty({format:'date-time'}) createdAt:string;
  @ApiProperty({type:String,nullable:true,format:'date-time'}) resolvedAt:string|null;
  @ApiProperty({type:String,nullable:true,format:'uuid'}) orderId:string|null;
  @ApiProperty({type:String,nullable:true}) reason:string|null;
  @ApiPropertyOptional({type:[RedemptionHistoryDto]}) history?:RedemptionHistoryDto[];
}
export class RedemptionPageDto {
  @ApiProperty({type:[RedemptionResponseDto]}) items:RedemptionResponseDto[];
  @ApiProperty() total:number; @ApiProperty() page:number; @ApiProperty() limit:number;
}
