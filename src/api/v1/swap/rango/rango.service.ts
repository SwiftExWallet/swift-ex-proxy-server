import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
    try {
      const url = `${process.env.RANGO_BASE_URL}/routing/best`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apiKey: process.env.RANGO_API_KEY as string,
        },
        body: JSON.stringify(rangoRouteDto),
      });
      return await response.json();
    } catch (error: any) {
      this.logger.error(error);
      const message =
        error.response.data.description ||
        error.response.data ||
        'unable to get swap quote';
      throw new BadRequestException(message);
    }
  }

  async routes(rangoRouteDto: RangoRouteDto) {
    try {
      const url = `${process.env.RANGO_BASE_URL}/routing/bests`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apiKey: process.env.RANGO_API_KEY as string,
        },
        body: JSON.stringify(rangoRouteDto),
      });
      return await response.json();
    } catch (error: any) {
      this.logger.error(error);
      const message =
        error.response.data.description ||
        error.response.data ||
        'unable to get swap quote';
      throw new BadRequestException(message);
    }
  }

  async confirmRoute(confirmRouteDto: ConfirmRouteDto) {
    try {
      const url = `${process.env.RANGO_BASE_URL}/routing/confirm`;
      const {
        requestId,
        toAddress,
        fromAddress,
        sourceChain,
        destinationChain,
      } = confirmRouteDto;
      const data = {
        requestId,
        selectedWallets: {
          [sourceChain]: fromAddress,
          [destinationChain]: toAddress,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apiKey: process.env.RANGO_API_KEY as string,
        },
        body: JSON.stringify(data),
      });
      return await response.json();
    } catch (error: any) {
      this.logger.error(error);
      const message =
        error.response.data.description ||
        error.response.data ||
        'unable to get swap quote';
      throw new BadRequestException(message);
    }
  }

  async prepareTx(prepareTxDto: PrepareTxDto) {
    try {
      const url = `${process.env.RANGO_BASE_URL}/tx/create`;
      const { requestId, swaps } = prepareTxDto;

      const txs: any[] = [];
      for (let i = 1; i <= swaps; i++) {
        const data = {
          requestId: requestId,
          step: i,
          userSettings: { slippage: 1, infiniteApprove: false },
          validations: { balance: true, fee: true, approve: true },
        };
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apiKey: process.env.RANGO_API_KEY as string,
          },
          body: JSON.stringify(data),
        });
        const result = await response.json();
        txs.push(result);
      }

      return txs;
    } catch (error: any) {
      this.logger.error(error);
      const message =
        error.response.data.description ||
        error.response.data ||
        'unable to get swap quote';
      throw new BadRequestException(message);
    }
  }

  async checkApprovalTransactionStatus(
    checkTransactionApprovalDto: CheckTransactionApprovalDto,
  ) {
    try {
      const { requestId, txId } = checkTransactionApprovalDto;
      const prepareUrl = `${process.env.RANGO_BASE_URL}/tx/${requestId}/check-approval`;
      const url = new URL(prepareUrl);
      url.searchParams.append('apiKey', process.env.RANGO_API_KEY as string);
      url.searchParams.append('txId', txId);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return await response.json();
    } catch (error: any) {
      this.logger.error(error);
      const message =
        error.response.data.description ||
        error.response.data ||
        'unable to get swap quote';
      throw new BadRequestException(message);
    }
  }
}
