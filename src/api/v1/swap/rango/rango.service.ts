import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { RangoRouteDto } from '../dto/rangoRoute';
import { ConfirmRouteDto } from '../dto/confirmRoute';
import { PrepareTxDto } from '../dto/prepareTxDto';
import { CheckTransactionApprovalDto } from '../dto/confirmTransactionApprovalDto';

@Injectable()
export class RangoService {
  private readonly logger = new Logger(RangoService.name);
  constructor() {}

  async metaData() {
    const url = `${process.env.RANGO_BASE_URL}/meta`;
    const config: AxiosRequestConfig = {
      params: {
        apiKey: process.env.RANGO_API_KEY,
      },
    };
    const response = await axios.get(url, config);
    return response.data;
  }

  async bestRoute(rangoRouteDto: RangoRouteDto) {
    const url = `${process.env.RANGO_BASE_URL}/routing/best`;
    const config: AxiosRequestConfig = {
      params: {
        apiKey: process.env.RANGO_API_KEY,
        headers: { 'content-type': 'application/json' },
      },
    };
    console.log(config);
    const response = await axios.post(url, rangoRouteDto, config);
    return response.data;
  }

  async routes(rangoRouteDto: RangoRouteDto) {
    const url = `${process.env.RANGO_BASE_URL}/routing/bests`;
    const config: AxiosRequestConfig = {
      params: {
        apiKey: process.env.RANGO_API_KEY,
        headers: { 'content-type': 'application/json' },
      },
    };
    console.log(config);
    const response = await axios.post(url, rangoRouteDto, config);
    return response.data;
  }

  async confirmRoute(confirmRouteDto: ConfirmRouteDto) {
    const url = `${process.env.RANGO_BASE_URL}/routing/confirm`;
    const { requestId, toAddress, fromAddress, sourceChain, destinationChain } =
      confirmRouteDto;
    const data = {
      requestId,
      selectedWallets: {
        [sourceChain]: fromAddress,
        [destinationChain]: toAddress,
      },
    };
    const config: AxiosRequestConfig = {
      params: {
        apiKey: process.env.RANGO_API_KEY,
        headers: { 'content-type': 'application/json' },
      },
    };
    const response = await axios.post(url, data, config);
    return response.data;
  }

  async prepareTx(prepareTxDto: PrepareTxDto) {
    const url = `${process.env.RANGO_BASE_URL}/tx/create`;
    const { requestId, swaps } = prepareTxDto;
    const config: AxiosRequestConfig = {
      params: {
        apiKey: process.env.RANGO_API_KEY,
        headers: { 'content-type': 'application/json' },
      },
    };
    const txs: any[] = [];
    for (let i = 1; i <= swaps; i++) {
      const data = {
        requestId: requestId,
        step: i,
        userSettings: { slippage: 1, infiniteApprove: false },
        validations: { balance: true, fee: true, approve: true },
      };
      const response = await axios.post(url, data, config);
      txs.push(response.data);
    }

    return txs;
  }

  async checkApprovalTransactionStatus(
    checkTransactionApprovalDto: CheckTransactionApprovalDto,
  ) {
    const { requestId, txId } = checkTransactionApprovalDto;
    const url = `${process.env.RANGO_BASE_URL}/tx/${requestId}/check-approval`;

    const config: AxiosRequestConfig = {
      params: {
        apiKey: process.env.RANGO_API_KEY,
        txId,
        headers: { 'content-type': 'application/json' },
      },
    };
    const response = await axios.get(url, config);
    return response.data;
  }
}
