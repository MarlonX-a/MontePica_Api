import { ApiProperty } from '@nestjs/swagger';
export class PointsBalanceDto {
  @ApiProperty({type:'integer'}) balance:number;
  @ApiProperty({type:'integer'}) pendingPoints:number;
  @ApiProperty({type:'integer'}) reservedPoints:number;
  @ApiProperty({type:'integer'}) availablePoints:number;
}
export class PointsSettingsResponseDto {
  @ApiProperty() enabled:boolean;
  @ApiProperty({minimum:1,maximum:1000}) pointsPerDollar:number;
  @ApiProperty() version:number;
  @ApiProperty({format:'date-time'}) createdAt:string;
}
export class PointsMovementDto {
  @ApiProperty({format:'uuid'}) id:string;
  @ApiProperty({enum:['earn','refundAdjustment','redeem','redemptionReturn']}) type:string;
  @ApiProperty({type:'integer'}) points:number;
  @ApiProperty({format:'uuid'}) paymentId:string;
  @ApiProperty({type:String,format:'uuid',nullable:true}) redemptionId:string|null;
  @ApiProperty({type:String,format:'uuid',nullable:true}) orderId:string|null;
  @ApiProperty({format:'date-time'}) createdAt:string;
}
export class PointsMovementPageDto {
  @ApiProperty({type:[PointsMovementDto]}) items:PointsMovementDto[];
  @ApiProperty() total:number;
  @ApiProperty() page:number;
  @ApiProperty() limit:number;
}
