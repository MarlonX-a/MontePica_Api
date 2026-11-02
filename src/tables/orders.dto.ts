import { Type, Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, IsUUID, Length, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class OrderItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() productId: string;
  @ApiProperty({ minimum: 1, maximum: 999 }) @IsInt() @Min(1) @Max(999) quantity: number;
  @ApiPropertyOptional({ maxLength: 500 }) @ValidateIf((_o, v) => v !== undefined) @Transform(trim) @IsString() @Length(0, 500) notes?: string;
}
export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto], minItems: 1, maxItems: 100 }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OrderItemDto) items: OrderItemDto[];
  @ApiPropertyOptional({ maxLength: 500 }) @ValidateIf((_o, v) => v !== undefined) @Transform(trim) @IsString() @Length(0, 500) notes?: string;
}
export class EditOrderDto extends CreateOrderDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion: number;
}
export class OrderTransitionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion: number;
}
export class CancelOrderDto extends OrderTransitionDto {
  @ApiProperty({ minLength: 1, maxLength: 500 }) @Transform(trim) @IsString() @Length(1, 500) reason: string;
}
export class OrderQueryDto {
  @ApiPropertyOptional({enum:['local','delivery']}) @ValidateIf((_o,v)=>v!==undefined) @IsIn(['local','delivery']) modality?:string;
  @ApiPropertyOptional({ enum:['submitted','preparing','ready','dispatched','delivered','cancelled'] }) @ValidateIf((_o, v) => v !== undefined) @IsIn(['submitted','preparing','ready','dispatched','delivered','cancelled']) status?: string;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() visitId?: string;
}
export class AdminOrderQueryDto extends OrderQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() tableId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @ValidateIf((_o, v) => v !== undefined) @IsUUID() operatingDayId?: string;
}
export class OrderDetailItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) productId: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPriceCents: number;
  @ApiProperty() subtotalCents: number;
  @ApiProperty() tracksInventory: boolean;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
}
export class DeliverySnapshotDto {
  @ApiProperty({type:String,nullable:true,format:'date-time'}) receiptSubmissionDeadline:string|null;
  @ApiProperty({type:String,nullable:true,format:'date-time'}) dispatchedAt:string|null;
  @ApiProperty({type:String,nullable:true,format:'date-time'}) deliveredAt:string|null;
  @ApiProperty({type:String,nullable:true,format:'uuid'}) dispatchedBy:string|null;
  @ApiProperty({type:String,nullable:true,format:'uuid'}) deliveredBy:string|null;
  @ApiProperty({format:'uuid'}) requestId:string;
  @ApiProperty() recipientName:string;
  @ApiProperty() phone:string;
  @ApiProperty() address:string;
  @ApiProperty({type:String,nullable:true}) references:string|null;
  @ApiProperty({type:Number,nullable:true}) latitude:number|null;
  @ApiProperty({type:Number,nullable:true}) longitude:number|null;
  @ApiProperty() configurationVersion:number;
  @ApiProperty() shippingCents:number;
}
export class OrderSettlementDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty() status:string;
}
export class OrderResponseDto {
  @ApiProperty({enum:['local','delivery']}) modality:string;
  @ApiProperty() productsCents:number;
  @ApiProperty() shippingCents:number;
  @ApiPropertyOptional({type:DeliverySnapshotDto,nullable:true,description:'Solo en detalle; se omite en listados.'}) delivery?:DeliverySnapshotDto|null;
  @ApiProperty({type:OrderSettlementDto,nullable:true}) settlement:OrderSettlementDto|null;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type:String,format: 'uuid',nullable:true }) visitId: string|null;
  @ApiProperty({ format: 'uuid' }) operatingDayId: string;
  @ApiProperty({ format: 'uuid' }) accountId: string;
  @ApiProperty({ enum: ['submitted','preparing','ready','dispatched','delivered','cancelled'] }) status: string;
  @ApiProperty({ type:String, nullable:true, format:'date-time' }) editableUntil: string | null;
  @ApiProperty() canEdit: boolean;
  @ApiProperty({ format: 'date-time' }) submittedAt: string;
  @ApiProperty({ format: 'uuid' }) versionId: string;
  @ApiProperty() version: number;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty() totalCents: number;
  @ApiProperty({ enum: ['USD'] }) currency: string;
  @ApiProperty({ type: [OrderDetailItemDto] }) items: OrderDetailItemDto[];
}
export class OrderPageDto {
  @ApiProperty({ type: [OrderResponseDto] }) items: OrderResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
export class OrderHistoryDto {
  @ApiProperty() actorType: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) userId: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) guestSessionId: string | null;
  @ApiProperty() event: string;
  @ApiProperty({ type: String, nullable: true }) previousStatus: string | null;
  @ApiProperty() newStatus: string;
  @ApiProperty({ format: 'date-time' }) occurredAt: string;
}
export class AdminOrderResponseDto extends OrderResponseDto {
  @ApiProperty({ type: [OrderHistoryDto] }) history: OrderHistoryDto[];
}
