export interface CreateTableInsertMesaRow {
  id: string;
  code: string;
  active: boolean;
}

export interface TablesFindMesaRow {
  id: string;
  code: string;
  active: boolean;
  openVisitId: string;
}

export interface TablesFindMesaNextRow {
  total: number;
}

export interface TableFindMesaRow {
  id: string;
  code: string;
  active: boolean;
  openVisitId: string;
}

export interface UpdateTableFindMesaRow {
  id: string;
  code: string;
  active: boolean;
}

export interface UpdateTableFindVisitaMesaRow {
  '1': string;
}

export interface UpdateTableUpdateMesaRow {
  id: string;
  code: string;
  active: boolean;
}

export interface OpenVisitFindJornadaOperativaRow {
  id: string;
}

export interface OpenVisitFindMesaRow {
  active: boolean;
}

export interface OpenVisitFindJornadaOperativaNextRow {
  current: boolean;
}

export interface OpenVisitFindVisitaMesaRow {
  id_visita: string;
}

export interface OpenVisitInsertVisitaMesaRow {
  id: string;
  status: string;
  openedAt: Date;
}

export interface IssueQrUpdateMesaRow {
  qrVersion: number;
}

export interface IssueQrUpdateParticipanteRow {
  id: string;
}
