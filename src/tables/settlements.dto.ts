import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SettlementEmptyDto {}
export class SettlementCancelDto {
  @ApiProperty({ minLength: 1, maxLength: 500 }) @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(1,500) reason: string;
}
export class AccountListDto {
  @ApiPropertyOptional({enum:['local','delivery']}) @ValidateIf((_o,v)=>v!==undefined) @IsIn(['local','delivery']) modality?:string;
  @ApiPropertyOptional({default:1}) @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) page=1;
  @ApiPropertyOptional({default:20,maximum:100}) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit=20;
  @ApiPropertyOptional({enum:['open','closed']}) @ValidateIf((_o,v) => v !== undefined) @IsIn(['open','closed']) status?: string;
}
export class AdminAccountListDto extends AccountListDto {
  @ApiPropertyOptional({format:'uuid'}) @ValidateIf((_o,v) => v !== undefined) @IsUUID() operatingDayId?: string;
  @ApiPropertyOptional({format:'uuid'}) @ValidateIf((_o,v) => v !== undefined) @IsUUID() visitId?: string;
}
export class SettlementListDto {
  @ApiPropertyOptional({default:1}) @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) page=1;
  @ApiPropertyOptional({default:20,maximum:100}) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit=20;
  @ApiPropertyOptional({enum:['pending','cancelled','settled']}) @ValidateIf((_o,v) => v !== undefined) @IsIn(['pending','cancelled','settled']) status?: string;
  @ApiPropertyOptional({format:'uuid'}) @ValidateIf((_o,v) => v !== undefined) @IsUUID() accountId?: string;
  @ApiPropertyOptional({format:'uuid'}) @ValidateIf((_o,v) => v !== undefined) @IsUUID() cashRegisterId?: string;
}
export class ConsumptionLineDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty({format:'uuid'}) orderId:string;
  @ApiProperty() orderStatus:string;
  @ApiProperty({format:'uuid'}) productId:string;
  @ApiProperty() productName:string;
  @ApiProperty() quantity:number;
  @ApiProperty() unitPriceCents:number;
  @ApiProperty() subtotalCents:number;
}
export class SettlementLineDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty({format:'uuid'}) assignmentId:string;
  @ApiProperty({format:'uuid'}) productId:string;
  @ApiProperty() productName:string;
  @ApiProperty() quantity:number;
  @ApiProperty() unitPriceCents:number;
  @ApiProperty() subtotalCents:number;
  @ApiProperty() active:boolean;
}
export class SettlementResponseDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty({format:'uuid'}) accountId:string;
  @ApiProperty({format:'uuid'}) cashRegisterId:string;
  @ApiProperty({enum:['pending','cancelled','settled']}) status:string;
  @ApiProperty({type:String,nullable:true,format:'date-time'}) settledAt:string|null;
  @ApiProperty({type:String,nullable:true,enum:['cash','zeroTotal','transfer']}) resolution:string|null;
  @ApiProperty({type:String,nullable:true,format:'uuid'}) paymentId:string|null;
  @ApiProperty() productsCents:number;
  @ApiProperty() shippingCents:number;
  @ApiProperty() totalCents:number;
  @ApiProperty({enum:['USD']}) currency:string;
  @ApiProperty({format:'uuid'}) createdBy:string;
  @ApiProperty({format:'date-time'}) createdAt:string;
  @ApiProperty({type:String,nullable:true,format:'uuid'}) cancelledBy:string|null;
  @ApiProperty({type:String,nullable:true,format:'date-time'}) cancelledAt:string|null;
  @ApiProperty({type:String,nullable:true}) cancellationReason:string|null;
  @ApiProperty({type:[SettlementLineDto]}) items:SettlementLineDto[];
}
export class PendingSettlementDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty({enum:['pending']}) status:string;
  @ApiProperty() totalCents:number;
}
export class AccountResponseDto {
  @ApiProperty({enum:['local','delivery']}) modality:string;
  @ApiProperty() productsCents:number;
  @ApiProperty() shippingCents:number;
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty({format:'uuid'}) clientId:string;
  @ApiProperty({type:String,format:'uuid',nullable:true}) participantId:string|null;
  @ApiProperty({format:'uuid'}) operatingDayId:string;
  @ApiProperty({type:String,format:'uuid',nullable:true}) visitId:string|null;
  @ApiProperty({enum:['open','closed']}) status:string;
  @ApiProperty({format:'date-time'}) createdAt:string;
  @ApiProperty({type:String,nullable:true,format:'date-time'}) closedAt:string|null;
  @ApiProperty({type:[ConsumptionLineDto]}) items:ConsumptionLineDto[];
  @ApiProperty() totalCents:number;
  @ApiProperty() paidCents:number;
  @ApiProperty() pendingCents:number;
  @ApiProperty({enum:['USD']}) currency:string;
  @ApiProperty({type:PendingSettlementDto,nullable:true}) pendingSettlement:PendingSettlementDto|null;
}
export class AccountPageDto {
  @ApiProperty({type:[AccountResponseDto]}) items:AccountResponseDto[];
  @ApiProperty() total:number;
  @ApiProperty() page:number;
  @ApiProperty() limit:number;
}
export class SettlementPageDto {
  @ApiProperty({type:[SettlementResponseDto]}) items:SettlementResponseDto[];
  @ApiProperty() total:number;
  @ApiProperty() page:number;
  @ApiProperty() limit:number;
}
