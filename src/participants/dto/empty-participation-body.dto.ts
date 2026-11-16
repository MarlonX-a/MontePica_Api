export class EmptyParticipationBodyDto {
  // An empty request body is required; global whitelist validation rejects every supplied field.
  static readonly isEmptyBody = true;
}
