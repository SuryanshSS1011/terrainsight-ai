import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react';
import { RootState } from '.';
import { logout, setCredentials } from './slices/authSlice';

const baseQuery = fetchBaseQuery({
    baseUrl: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
    prepareHeaders: (headers, { getState }) => {
        const token = (getState() as RootState).auth.token;
        if (token) {
            headers.set('authorization', `Bearer ${token}`);
        }
        return headers;
    },
});

const baseQueryWithReauth = async (args: any, api: any, extraOptions: any) => {
    let result = await baseQuery(args, api, extraOptions);

    if (result.error && result.error.status === 401) {
        // Try to get a new token
        const refreshToken = (api.getState() as RootState).auth.refreshToken;

        if (refreshToken) {
            const refreshResult = await baseQuery(
                {
                    url: '/auth/refresh',
                    method: 'POST',
                    body: { refreshToken },
                },
                api,
                extraOptions
            );

            if (refreshResult.data) {
                // Store the new token
                api.dispatch(setCredentials(refreshResult.data as any));
                // Retry the original query
                result = await baseQuery(args, api, extraOptions);
            } else {
                api.dispatch(logout());
            }
        } else {
            api.dispatch(logout());
        }
    }

    return result;
};

const baseQueryWithRetry = retry(baseQueryWithReauth, { maxRetries: 2 });

export const api = createApi({
    reducerPath: 'api',
    baseQuery: baseQueryWithRetry,
    tagTypes: ['Property', 'RiskAssessment', 'Alert', 'User', 'Community'],
    endpoints: (builder) => ({
        // Auth endpoints
        login: builder.mutation<
            { user: any; accessToken: string; refreshToken: string },
            { email: string; password: string }
        >({
            query: (credentials) => ({
                url: '/auth/login',
                method: 'POST',
                body: credentials,
            }),
        }),

        register: builder.mutation<
            { user: any; accessToken: string; refreshToken: string },
            { email: string; password: string; name: string; role: string }
        >({
            query: (userData) => ({
                url: '/auth/register',
                method: 'POST',
                body: userData,
            }),
        }),

        // Property endpoints
        getProperties: builder.query<any[], void>({
            query: () => '/properties',
            providesTags: ['Property'],
        }),

        getProperty: builder.query<any, string>({
            query: (id) => `/properties/${id}`,
            providesTags: (result, error, id) => [{ type: 'Property', id }],
        }),

        createProperty: builder.mutation<any, any>({
            query: (property) => ({
                url: '/properties',
                method: 'POST',
                body: property,
            }),
            invalidatesTags: ['Property'],
        }),

        updateProperty: builder.mutation<any, { id: string; data: any }>({
            query: ({ id, data }) => ({
                url: `/properties/${id}`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: (result, error, { id }) => [
                { type: 'Property', id },
                'Property',
            ],
        }),

        deleteProperty: builder.mutation<void, string>({
            query: (id) => ({
                url: `/properties/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Property'],
        }),

        // Risk Assessment endpoints
        getRiskAssessment: builder.query<any, string>({
            query: (propertyId) => `/risk-assessment/${propertyId}`,
            providesTags: (result, error, propertyId) => [
                { type: 'RiskAssessment', id: propertyId },
            ],
        }),

        calculateRisk: builder.mutation<any, string>({
            query: (propertyId) => ({
                url: `/risk-assessment/calculate/${propertyId}`,
                method: 'POST',
            }),
            invalidatesTags: (result, error, propertyId) => [
                { type: 'RiskAssessment', id: propertyId },
                { type: 'Property', id: propertyId },
            ],
        }),

        getRiskHistory: builder.query<any[], { propertyId: string; days?: number }>({
            query: ({ propertyId, days = 30 }) =>
                `/risk-assessment/history/${propertyId}?days=${days}`,
            providesTags: (result, error, { propertyId }) => [
                { type: 'RiskAssessment', id: propertyId },
            ],
        }),

        getHighRiskProperties: builder.query<any, { threshold?: number; limit?: number }>({
            query: ({ threshold = 70, limit = 50 }) =>
                `/risk-assessment/high-risk-properties?threshold=${threshold}&limit=${limit}`,
            providesTags: ['Property', 'RiskAssessment'],
        }),

        // Alert endpoints
        getAlerts: builder.query<any[], { status?: string; severity?: string }>({
            query: (params) => ({
                url: '/alerts',
                params,
            }),
            providesTags: ['Alert'],
        }),

        getAlert: builder.query<any, string>({
            query: (id) => `/alerts/${id}`,
            providesTags: (result, error, id) => [{ type: 'Alert', id }],
        }),

        acknowledgeAlert: builder.mutation<any, string>({
            query: (alertId) => ({
                url: `/alerts/${alertId}/acknowledge`,
                method: 'POST',
            }),
            invalidatesTags: (result, error, alertId) => [
                { type: 'Alert', id: alertId },
                'Alert',
            ],
        }),

        dismissAlert: builder.mutation<void, string>({
            query: (alertId) => ({
                url: `/alerts/${alertId}/dismiss`,
                method: 'POST',
            }),
            invalidatesTags: (result, error, alertId) => [
                { type: 'Alert', id: alertId },
                'Alert',
            ],
        }),

        // Community endpoints
        getNeighborhood: builder.query<any, string>({
            query: (propertyId) => `/community/neighborhood/${propertyId}`,
            providesTags: ['Community'],
        }),

        getCommunityAlerts: builder.query<any[], string>({
            query: (zoneId) => `/community/alerts/${zoneId}`,
            providesTags: ['Community', 'Alert'],
        }),

        joinCommunityNetwork: builder.mutation<any, string>({
            query: (propertyId) => ({
                url: `/community/join/${propertyId}`,
                method: 'POST',
            }),
            invalidatesTags: ['Community'],
        }),

        // Analytics endpoints
        getPortfolioStats: builder.query<any, void>({
            query: () => '/analytics/portfolio',
            providesTags: ['Property', 'RiskAssessment'],
        }),

        getRiskTrends: builder.query<any, { startDate: string; endDate: string }>({
            query: ({ startDate, endDate }) =>
                `/analytics/trends?startDate=${startDate}&endDate=${endDate}`,
            providesTags: ['RiskAssessment'],
        }),

        getInsuranceMetrics: builder.query<any, void>({
            query: () => '/analytics/insurance',
            providesTags: ['Property'],
        }),

        // File upload
        uploadPropertyImage: builder.mutation<any, { propertyId: string; file: File }>({
            query: ({ propertyId, file }) => {
                const formData = new FormData();
                formData.append('image', file);
                return {
                    url: `/properties/${propertyId}/images`,
                    method: 'POST',
                    body: formData,
                };
            },
            invalidatesTags: (result, error, { propertyId }) => [
                { type: 'Property', id: propertyId },
            ],
        }),

        // Weather data
        getCurrentWeather: builder.query<any, { lat: number; lon: number }>({
            query: ({ lat, lon }) => `/weather/current?lat=${lat}&lon=${lon}`,
        }),

        getWeatherForecast: builder.query<any, { lat: number; lon: number }>({
            query: ({ lat, lon }) => `/weather/forecast?lat=${lat}&lon=${lon}`,
        }),

        // Subscription management
        getSubscriptionStatus: builder.query<any, void>({
            query: () => '/subscription/status',
            providesTags: ['User'],
        }),

        updateSubscription: builder.mutation<any, { plan: string; paymentMethod: string }>({
            query: (data) => ({
                url: '/subscription/update',
                method: 'POST',
                body: data,
            }),
            invalidatesTags: ['User'],
        }),
    }),
});

// Export hooks for usage in components
export const {
    useLoginMutation,
    useRegisterMutation,
    useGetPropertiesQuery,
    useGetPropertyQuery,
    useCreatePropertyMutation,
    useUpdatePropertyMutation,
    useDeletePropertyMutation,
    useGetRiskAssessmentQuery,
    useCalculateRiskMutation,
    useGetRiskHistoryQuery,
    useGetHighRiskPropertiesQuery,
    useGetAlertsQuery,
    useGetAlertQuery,
    useAcknowledgeAlertMutation,
    useDismissAlertMutation,
    useGetNeighborhoodQuery,
    useGetCommunityAlertsQuery,
    useJoinCommunityNetworkMutation,
    useGetPortfolioStatsQuery,
    useGetRiskTrendsQuery,
    useGetInsuranceMetricsQuery,
    useUploadPropertyImageMutation,
    useGetCurrentWeatherQuery,
    useGetWeatherForecastQuery,
    useGetSubscriptionStatusQuery,
    useUpdateSubscriptionMutation,
} = api;