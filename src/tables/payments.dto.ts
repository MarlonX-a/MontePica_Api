import { Type } from 'class-transformer';
import { IsIn, IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CashPaymentDto {
  @ApiProperty({minimum:1,maximum:Number.MAX_SAFE_INTEGER}) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) receivedCents:number;
}
export class PaymentListDto {
  @ApiPropertyOptional({enum:['cash','transfer']}) @ValidateIf((_o,v)=>v!==undefined) @IsIn(['cash','transfer']) method?:string;
  @ApiPropertyOptional({enum:['pendingVerification','confirmed','rejected']}) @ValidateIf((_o,v)=>v!==undefined) @IsIn(['pendingVerification','confirmed','rejected']) status?:string;
  @ApiPropertyOptional({default:1}) @Type(()=>Number) @IsInt() @Min(1) @Max(2147483647) page=1;
  @ApiPropertyOptional({default:20,maximum:100}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
  @ApiPropertyOptional({format:'uuid'}) @ValidateIf((_o,v)=>v!==undefined) @IsUUID() settlementId?:string;
}
export class AdminPaymentListDto extends PaymentListDto {
  @ApiPropertyOptional({format:'uuid'}) @ValidateIf((_o,v)=>v!==undefined) @IsUUID() cashRegisterId?:string;
  @ApiPropertyOptional({format:'uuid'}) @ValidateIf((_o,v)=>v!==undefined) @IsUUID() accountId?:string;
}
export class PaymentResponseDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty({format:'uuid'}) settlementId:string;
  @ApiProperty({format:'uuid'}) accountId:string;
  @ApiProperty({format:'uuid'}) cashRegisterId:string;
  @ApiProperty({enum:['cash','transfer']}) method:string;
  @ApiProperty({enum:['pendingVerification','confirmed','rejected']}) status:string;
  @ApiProperty() amountCents:number;
  @ApiProperty({description:'Importe históricamente cobrado; una devolución no modifica este dato.'}) paidCents:number;
  @ApiProperty() refundPendingCents:number;
  @ApiProperty() refundedCents:number;
  @ApiProperty({type:Number,nullable:true}) receivedCents:number|null;
  @ApiProperty({type:Number,nullable:true}) changeCents:number|null;
  @ApiProperty({type:'object',nullable:true,additionalProperties:true}) receipt:Record<string,unknown>|null;
  @ApiProperty({type:String,nullable:true,format:'date-time'}) verifiedAt:string|null;
  @ApiProperty({type:String,nullable:true}) rejectionReason:string|null;
  @ApiProperty({enum:['USD']}) currency:string;
  @ApiProperty({format:'date-time'}) createdAt:string;
}
export class PaymentPageDto {
  @ApiProperty({type:[PaymentResponseDto]}) items:PaymentResponseDto[];
  @ApiProperty() total:number;
  @ApiProperty() page:number;
  @ApiProperty() limit:number;
}
export class PaymentHistoryDto {
  @ApiProperty({type:String,nullable:true,format:'uuid'}) userId:string|null;
  @ApiProperty({type:String,nullable:true,format:'uuid'}) guestSessionId:string|null;
  @ApiProperty() event:string;
  @ApiProperty({type:String,nullable:true}) previousStatus:string|null;
  @ApiProperty() newStatus:string;
  @ApiProperty({format:'date-time'}) occurredAt:string;
}
export class AdminPaymentResponseDto extends PaymentResponseDto {
  @ApiProperty({type:String,nullable:true,format:'uuid'}) registeredBy:string|null;
  @ApiProperty({type:String,nullable:true,format:'uuid'}) registeredByGuestSessionId:string|null;
  @ApiProperty({type:String,nullable:true,format:'uuid'}) verifiedBy:string|null;
  @ApiProperty({type:String,nullable:true}) bankOperationReference:string|null;
  @ApiProperty({type:[PaymentHistoryDto]}) history:PaymentHistoryDto[];
}
export class PaymentResourceStateDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty() status:string;
}
export class PaymentCompletionDto {
  @ApiProperty({type:AdminPaymentResponseDto,nullable:true}) payment:AdminPaymentResponseDto|null;
  @ApiProperty({type:PaymentResourceStateDto}) settlement:PaymentResourceStateDto;
  @ApiProperty({type:PaymentResourceStateDto}) account:PaymentResourceStateDto;
  @ApiProperty({type:PaymentResourceStateDto}) participant:PaymentResourceStateDto;
}
