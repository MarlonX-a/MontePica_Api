import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class DeliverySettingsDto {
  @ApiProperty({default:900,minimum:60,maximum:86400}) @IsInt() @Min(60) @Max(86400) receiptSubmissionSeconds=900;
  @ApiProperty() @IsBoolean() enabled:boolean;
  @ApiProperty({minLength:1,maxLength:500}) @Transform(trim) @IsString() @Length(1,500) coverageDescription:string;
  @ApiProperty({minimum:0,maximum:Number.MAX_SAFE_INTEGER}) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) shippingFeeCents:number;
}
export class DeliveryRequestDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) @Max(2147483647) configurationVersion:number;
  @ApiProperty({minLength:1,maxLength:160}) @Transform(trim) @IsString() @Length(1,160) recipientName:string;
  @ApiProperty({minLength:1,maxLength:20}) @Transform(trim) @IsString() @Length(1,20) phone:string;
  @ApiProperty({minLength:1,maxLength:500}) @Transform(trim) @IsString() @Length(1,500) address:string;
  @ApiPropertyOptional({maxLength:500}) @ValidateIf((_o,v)=>v!==undefined) @Transform(trim) @IsString() @Length(0,500) references?:string;
  @ApiPropertyOptional({minimum:-90,maximum:90}) @ValidateIf((_o,v)=>v!==undefined) @IsNumber({allowInfinity:false,allowNaN:false}) @Min(-90) @Max(90) latitude?:number;
  @ApiPropertyOptional({minimum:-180,maximum:180}) @ValidateIf((_o,v)=>v!==undefined) @IsNumber({allowInfinity:false,allowNaN:false}) @Min(-180) @Max(180) longitude?:number;
}
export class DeliveryRejectDto { @ApiProperty({minLength:1,maxLength:500}) @Transform(trim) @IsString() @Length(1,500) reason:string; }
export class DeliveryEmptyDto {}
export class DeliveryListDto {
  @ApiPropertyOptional({default:1}) @Type(()=>Number) @IsInt() @Min(1) @Max(2147483647) page=1;
  @ApiPropertyOptional({default:20,maximum:100}) @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit=20;
  @ApiPropertyOptional({enum:['pending','approved','rejected','cancelled']}) @ValidateIf((_o,v)=>v!==undefined) @IsIn(['pending','approved','rejected','cancelled']) status?:string;
}
export class AdminDeliveryListDto extends DeliveryListDto {
  @ApiPropertyOptional({format:'uuid'}) @ValidateIf((_o,v)=>v!==undefined) @IsUUID() clientId?:string;
  @ApiPropertyOptional({format:'uuid'}) @ValidateIf((_o,v)=>v!==undefined) @IsUUID() operatingDayId?:string;
}
export class DeliverySettingsResponseDto {
  @ApiProperty() receiptSubmissionSeconds:number;
  @ApiProperty() version:number;
  @ApiProperty() enabled:boolean;
  @ApiProperty() coverageDescription:string;
  @ApiProperty() shippingFeeCents:number;
  @ApiProperty({enum:['USD']}) currency:string;
}
export class AdminDeliverySettingsResponseDto extends DeliverySettingsResponseDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty({type:String,nullable:true,format:'uuid'}) configuredBy:string|null;
  @ApiProperty({format:'date-time'}) createdAt:string;
}
export class DeliveryResponseDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty({format:'uuid'}) clientId:string;
  @ApiProperty({format:'uuid'}) operatingDayId:string;
  @ApiProperty() configurationVersion:number;
  @ApiProperty() recipientName:string;
  @ApiProperty() phone:string;
  @ApiProperty() address:string;
  @ApiProperty({type:String,nullable:true}) references:string|null;
  @ApiProperty({type:Number,nullable:true}) latitude:number|null;
  @ApiProperty({type:Number,nullable:true}) longitude:number|null;
  @ApiProperty() shippingFeeCents:number;
  @ApiProperty({enum:['USD']}) currency:string;
  @ApiProperty({enum:['pending','approved','rejected','cancelled']}) status:string;
  @ApiProperty({format:'date-time'}) createdAt:string;
  @ApiProperty({type:String,nullable:true,format:'date-time'}) decidedAt:string|null;
  @ApiProperty({type:String,nullable:true,format:'uuid'}) decidedBy:string|null;
  @ApiProperty({type:String,nullable:true}) rejectionReason:string|null;
  @ApiProperty({type:String,nullable:true,format:'date-time'}) cancelledAt:string|null;
  @ApiProperty() usableToday:boolean;
}
export class DeliveryPageDto {
  @ApiProperty({type:[DeliveryResponseDto]}) items:DeliveryResponseDto[];
  @ApiProperty() total:number;
  @ApiProperty() page:number;
  @ApiProperty() limit:number;
}
