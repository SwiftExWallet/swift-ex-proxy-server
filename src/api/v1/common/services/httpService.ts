import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { HttpRequestDto } from '../dto/httpRequest.dto';

type HttpRequest = Omit<HttpRequestDto, 'headers'> & {
  headers?: AxiosRequestConfig['headers'];
};

type HttpResponseBody = Record<string, any> & {
  success?: boolean;
};

export interface HttpServiceResponse<T = unknown> {
  status: boolean | undefined;
  data: T;
}

@Injectable()
export class HttpService {
  async request(
    httpRequestDto: HttpRequest,
  ): Promise<HttpServiceResponse<Record<string, any>>> {
    try {
      const { body, method, url, headers } = httpRequestDto;

      const config: AxiosRequestConfig = {
        method,
        maxBodyLength: Infinity,
        url,
        headers,
        data: JSON.stringify(body),
      };

      const response = await axios.request<HttpResponseBody>(config);
      return {
        status: response?.data?.success,
        data: {
          ...body,
          ...response.data,
        },
      };
    } catch (error) {
      this.throwHttpError(error);
    }
  }

  async get(
    httpRequestDto: HttpRequest,
  ): Promise<HttpServiceResponse<Record<string, any>>> {
    try {
      const { method, url, headers } = httpRequestDto;

      const config: AxiosRequestConfig = {
        method,
        maxBodyLength: Infinity,
        url,
        headers,
      };

      const response = await axios.request<HttpResponseBody>(config);
      return {
        status: response?.data?.success,
        data: {
          ...response.data,
        },
      };
    } catch (error) {
      this.throwHttpError(error);
    }
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

  private throwHttpError(error: unknown): never {
    const axiosError = error as {
      response?: {
        data?: {
          errors?: Record<string, string[]>;
        };
        status?: number;
      };
    };
    const errorsObj = axiosError.response?.data?.errors;
    let defaultMessage = 'Error in http request.';

    if (errorsObj && typeof errorsObj === 'object') {
      const firstKey = Object.keys(errorsObj)[0];
      if (firstKey && Array.isArray(errorsObj[firstKey])) {
        defaultMessage = errorsObj[firstKey][0];
      }
    }

    throw new HttpException(
      defaultMessage,
      axiosError.response?.status || HttpStatus.BAD_REQUEST,
    );
  }
}
