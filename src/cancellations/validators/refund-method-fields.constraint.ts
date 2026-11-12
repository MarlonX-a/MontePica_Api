import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { RefundExecutionDto } from '../../refunds/dto/refund-execution.dto.js';

@ValidatorConstraint({ name: 'refundMethodFields', async: false })
export class RefundMethodFieldsConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const dto = args.object as RefundExecutionDto;
    return dto.method === 'cash'
      ? typeof dto.recipientName === 'string' &&
          dto.bankOperationReference === undefined
      : typeof dto.bankOperationReference === 'string' &&
          dto.recipientName === undefined;
  }

  defaultMessage() {
    return 'Envía únicamente los campos que corresponden al método seleccionado.';
  }
}
