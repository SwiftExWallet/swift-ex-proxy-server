import { Injectable } from '@nestjs/common';
import { AlchemyRequestDto } from './dto/alchemy-request.dto';
import axios, { AxiosRequestConfig } from 'axios';
import { AxiosResponse } from '../../common/interface/axiosResponse';

@Injectable()
export class HttpService {
  async request(alchemyRequestDto: AlchemyRequestDto): Promise<AxiosResponse> {
    const { body, method, url, headers } = alchemyRequestDto;

    const config: AxiosRequestConfig = {
      method: method,
      maxBodyLength: Infinity,
      url: url,
      headers,
      data: JSON.stringify(body),
    };

    const response = await axios.request(config);
    return {
      status: response?.data?.success,
      data: JSON.stringify(response.data),
    };
  }

  async put(url: string, body: any, headers?: Record<string, string>) {
    if (headers) {
      return axios.put(url, body, { headers });
    }
    return axios.put(url, body);
  }

  async delete(url: string, body: any, headers?: Record<string, string>) {
    if (headers) {
      return axios.delete(url, {
        data: body,
        headers,
      });
    }
    return axios.delete(url, {
      data: body,
    });
  }
  async post(url: string, body: any, headers?: Record<string, string>) {
    if (headers) {
      return axios.post(url, body, { headers });
    }
    return axios.post(url, body);
  }
}
