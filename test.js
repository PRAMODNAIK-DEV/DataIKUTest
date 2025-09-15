import CloseIcon from "@mui/icons-material/Close";
import {
    Box,
    Grid,
    IconButton,
    Modal,
    ThemeProvider,
    Typography,
} from "@mui/material";
import Button from "@mui/material/Button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultIgnoreFields } from "../../helpers/constants/agentFormMockData";
import { PromptContext } from "../../helpers/contexts/promptLibraryContext";
import { agentFormInputModalProps } from "../../helpers/interfaces/AgentFormInput";
import Theme from "../../styles/muiTheme-frontdoor";
import CommonComponents from "../common/AgentFormFields/CommonComponents";
import DotAnimation from "../common/DotAnimation/DotAnimation";
import GlobalLoader from "../common/GlobalLoader";
import ToastMessage, { TOAST_TYPE } from "../common/ToastMessage/ToastMessage";
import "./AgentFormInputModal.scss";
import Loader from "../common/Loader/Loader";

function usePrevious(value: any) {
    const ref = useRef();
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}

const AgentFormInputModal = ({
    openAgent = false,
    agentDetail,
    handleCloseAgent,
    onSubmitCallBack = (selected, mockupUpdate) => { },
    ignoreFields = defaultIgnoreFields,
    title = null,
    showComplexFields = false,
    chipData,
    loading = false,
    resetFormTrigger,
    failedCondition = "Agent does not have any configuration.",
    defaultSelectedParameters = {},
}: agentFormInputModalProps) => {
    const [isLoading, setLoading] = useState(false);
    const [openToast, setOpenToast] = useState<boolean>(false);
    const [childProperties, setChildProperties] = useState({});
    const [toastInfo, setToastInfo] = useState({
        message: "",
        severity: TOAST_TYPE.SUCCESS,
    });
    const [localAgentDetail, setLocalAgentDetail] = useState(agentDetail);
    const [browserFields, setBrowserFields] = useState<string[]>(ignoreFields);
    const [formData2, setFormData2] = useState<any>({});
    const [keyName, setKeyName] = useState<string>("");

    const [formData, setFormData] = useState<any>(() => {
        if (Object.keys(defaultSelectedParameters).length > 0) {
            return defaultSelectedParameters;
        }

        const initialState: any = {};
        const allFields = (localAgentDetail?.skills_config || []).flatMap(
            (skill: any) => Object.entries(skill.input_schema?.properties || {})
        );

        allFields.forEach(([key, value]: any) => {
            if (!browserFields.includes(key)) {
                initialState[key] = value.default === "None" ? "" : value.default || "";
            }
        });

        // Always include model and system_prompt from agentDetail initially
        initialState.model = localAgentDetail?.model || "";
        initialState.agent_system_prompt = localAgentDetail?.system_prompt || "";

        return initialState;
    });

    const combinedProperties = useMemo(() => {
        return (localAgentDetail?.skills_config || []).reduce(
            (acc, skill) => ({
                ...acc,
                ...(skill.input_schema?.properties || {}),
            }),
            {}
        );
    }, [localAgentDetail]);

    // This is the new, combined memoized function that determines if the button should be disabled.
    const isSubmitDisabled = useMemo(() => {
        const requiredFields = new Set<string>();

        // Add static required fields
        (localAgentDetail?.skills_config || []).forEach(skill => {
            (skill.input_schema?.required || []).forEach((key: string) => {
                if (!browserFields.includes(key)) {
                    requiredFields.add(key);
                }
            });
        });

        // Add dynamic required fields
        Object.entries(combinedProperties).forEach(([key, data]: any) => {
            if (data?.$ref || data?.anyOf?.[0]?.$ref) {
                const reference = data?.$ref || data?.anyOf?.[0]?.$ref;
                const referenceKeys = reference.replace("#/", "").split("/");

                localAgentDetail.skills_config?.forEach((loop: any) => {
                    const def = loop.input_schema?.$defs?.[referenceKeys[1]];
                    if (def) {
                        (def.required || []).forEach((dynamicKey: string) => {
                            if (!browserFields.includes(dynamicKey)) {
                                requiredFields.add(dynamicKey);
                            }
                        });
                    }
                });
            }
        });

        // Special case: `model` is always required
        if (localAgentDetail?.model) {
            requiredFields.add('model');
        }

        // Check if any required field is empty
        return [...requiredFields].some((fieldKey) => {
            // Check the main formData object
            const value = formData?.[fieldKey];
            
            // Check nested query_params if needed
            const nestedValue = formData?.query_params?.[fieldKey];

            // A field is considered empty if its value is null, undefined, empty string, or an empty array/object
            const isEmpty = (val: any) => {
                if (val === undefined || val === null || val === "") return true;
                if (Array.isArray(val) && val.length === 0) return true;
                if (typeof val === "object" && Object.keys(val).length === 0) return true;
                return false;
            };

            // If it's a dynamic field, check if its parent container is filled. This can be complex.
            // A simpler, more robust check is just to look for its value at the top level,
            // or inside `query_params`, which `updateDefaultsInSkillsConfig` handles.
            if (isEmpty(value) && isEmpty(nestedValue)) {
                 return true;
            }

            return false;
        });
    }, [formData, localAgentDetail, browserFields]);
    
    // ... all other useEffects and handlers remain the same ...
    
    // useEffects for initialization and reset
    useEffect(() => {
        setLoading(!localAgentDetail?.agent_id && openAgent);
    }, [localAgentDetail, openAgent]);

    useEffect(() => {
        if (
            defaultSelectedParameters &&
            Object.keys(defaultSelectedParameters).length > 0
        ) {
            const updated = updateDefaultsInSkillsConfig(
                agentDetail,
                defaultSelectedParameters
            );
            setLocalAgentDetail(updated);
        } else {
            setLocalAgentDetail(agentDetail);
        }
    }, [agentDetail, defaultSelectedParameters]);

    useEffect(() => {
        if (resetFormTrigger !== undefined) {
            const initialState: any = {};
            const allFields = (localAgentDetail?.skills_config || []).flatMap(
                (skill: any) => Object.entries(skill.input_schema?.properties || {})
            );

            allFields.forEach(([key, value]: any) => {
                if (!browserFields.includes(key)) {
                    initialState[key] =
                        value.default === "None" ? "" : value.default || "";
                }
            });

            initialState.model = localAgentDetail?.model || "";
            initialState.agent_system_prompt = localAgentDetail?.system_prompt || "";

            setFormData(initialState);
            setFormData2({});
            setDynamicFieldsData({});
            // No need to call handleAdditionalFieldsRef() here anymore
        }
    }, [resetFormTrigger, localAgentDetail?.agent_id]);

    useEffect(() => {
        // No need to call handleAdditionalFieldsRef() here anymore as it's
        // now part of the memoized function.
    }, [openAgent]);

    const updateDefaultsInSkillsConfig = (
        agentDetailtemp: any,
        defaultParams: any
    ) => {
        const skills = agentDetailtemp.skills_config;
        if (!skills || !Array.isArray(skills)) return agentDetailtemp;

        for (const skill of skills) {
            const inputSchema = skill.input_schema;
            const queryParams = defaultParams.query_params;

            if (!inputSchema?.$defs || !queryParams) continue;

            const queryParamKeys = Object.keys(queryParams);
            let bestMatchKey = "";
            let maxMatches = 0;

            for (const [key, schema] of Object.entries<any>(inputSchema.$defs)) {
                const schemaKeys = Object.keys(schema.properties || {});
                const matches = schemaKeys.filter((k) =>
                    queryParamKeys.includes(k)
                ).length;

                if (matches > maxMatches) {
                    bestMatchKey = key;
                    maxMatches = matches;
                }
            }

            if (!bestMatchKey) continue;

            const matchedSchema = inputSchema.$defs[bestMatchKey];
            for (const [key, value] of Object.entries(queryParams)) {
                if (matchedSchema.properties?.[key]) {
                    matchedSchema.properties[key].default = value;
                }
            }
            inputSchema.$defs[bestMatchKey] = matchedSchema;
            skill.input_schema = inputSchema;
        }
        return agentDetailtemp;
    };

    const handleAdditionalFieldsRef = () => {
        // This function is no longer needed in its current form
    };

    const handleDynamicFieldChange = (
        fieldKey: string,
        value: any,
        key: string
    ) => {
        setFormData2((prevState: any) => {
            const updatedFormData = {
                ...prevState,
                [fieldKey]: value,
            };
            setFormData((oldState: any) => ({
                ...oldState,
                [key]: updatedFormData,
            }));
            return updatedFormData;
        });
    };

    const closePrompt = () => {
        handleCloseAgent();
    };

    const mockupUpdate = (query: string) => {
        if (combinedProperties.query) {
            formData["query"] = query;
        } else if (combinedProperties.user_query) {
            formData["user_query"] = query;
        }
        if (Object.keys(childProperties).length > 0) {
            Object.entries(childProperties).map(([key, value]) => {
                if (Object.keys(value).includes("query")) {
                    formData[key].query = query;
                } else if (Object.keys(value).includes("user_query")) {
                    formData[key].user_query = query;
                }
            });
        }
        return formData;
    };

    const chooseHandle = () => {
        let finalFormData = { ...formData };
        onSubmitCallBack(finalFormData, mockupUpdate);
    };

    const handleInputChange = useCallback((key: string, value: any) => {
        setFormData((prevState: any) => {
            const updatedFormData = { ...prevState, [key]: value };
            return updatedFormData;
        });
    }, []);
    
    // The renderSkillSections function remains unchanged from your previous version,
    // as it correctly renders the fields based on agentDetail.
    const renderSkillSections = () => {
      // ... your existing renderSkillSections code ...
    };

    return (
        <ThemeProvider theme={Theme}>
            <GlobalLoader open={isLoading} />
            <Modal
                className="modal-cstm-container"
                open={openAgent}
                onClose={closePrompt}
                aria-labelledby="modal-modal-title"
                aria-describedby="modal-modal-description"
                style={{ zIndex: 900 }}
            >
                <>
                    <ToastMessage
                        severity={toastInfo.severity}
                        isVisible={openToast}
                        hideToast={setOpenToast}
                        message={toastInfo.message}
                    />
                    <Box className="modal-cstm-box">
                        <PromptContext.Provider value={{ isLoading, setLoading }}>
                            <Grid container spacing={0} className="model-header">
                                <Grid item xs={10} md={10}>
                                    <Typography className="modalTitle" variant="h6">
                                        <div className="Agent-name">
                                            {title || localAgentDetail?.name}
                                            {!localAgentDetail?.name && <DotAnimation />}
                                        </div>
                                    </Typography>
                                </Grid>
                                <Grid item xs={2} md={2}>
                                    <div className="closebtn-parent">
                                        <IconButton
                                            onClick={closePrompt}
                                            className="modalclose-cstm"
                                        >
                                            <CloseIcon />
                                        </IconButton>
                                    </div>
                                </Grid>
                            </Grid>
                            {!loading ? (
                                <Grid container spacing={0} className="agent-container">
                                    <div style={{ padding: '0 16px', marginBottom: '20px', width: '100%' }}>
                                        <Typography variant="h6" className="skill-section-title">
                                            Agent Configuration
                                        </Typography>
                                        <Grid container spacing={2}>
                                            <Grid item xs={12} md={6} sm={12} lg={6} xl={4} className="grid-padding">
                                                <CommonComponents
                                                    fieldKey="model"
                                                    datavlaue={{ title: "Model", type: "string" }}
                                                    handleInputChange={handleInputChange}
                                                    formData={formData}
                                                    agentDetail={localAgentDetail}
                                                    browserFields={browserFields}
                                                    isRequiredField={true}
                                                    chipData={chipData}
                                                />
                                            </Grid>
                                            <Grid item xs={12} md={6} sm={12} lg={6} xl={4} className="grid-padding">
                                                <CommonComponents
                                                    fieldKey="agent_system_prompt"
                                                    datavlaue={{ title: "System Prompt", type: "string", format: "text-area" }}
                                                    handleInputChange={handleInputChange}
                                                    formData={formData}
                                                    agentDetail={localAgentDetail}
                                                    browserFields={browserFields}
                                                    isRequiredField={false}
                                                    chipData={chipData}
                                                />
                                            </Grid>
                                        </Grid>
                                    </div>
                                    {renderSkillSections()}
                                </Grid>
                            ) : (
                                <div className="loader-center add-height">
                                    <Loader isLoading={loading} />
                                </div>
                            )}
                            <div className="tw-flex tw-flex-row tw-justify-center tw-items-center choose-cancel-button">
                                <div className="tw-w-4/4 tw-mr-2 tw-flex">
                                    <div className="tw-mr-right tw-mr-[20px]">
                                        <Button
                                            variant="contained"
                                            onClick={closePrompt}
                                            className="tw-w-full tw-flex tw-flex-row tw-w-[140px] tw-justify-end tw-items-center tw-cursor-pointer cancel-button"
                                        >
                                            <span>Cancel</span>
                                        </Button>
                                    </div>
                                    <div>
                                        <Button
                                            disabled={isSubmitDisabled}
                                            variant="contained"
                                            onClick={chooseHandle}
                                            className={
                                                !isSubmitDisabled
                                                    ? "tw-w-full tw-flex tw-flex-row tw-w-[140px] tw-justify-end tw-items-center tw-cursor-pointer choose-button"
                                                    : "tw-w-full tw-flex tw-flex-row tw-w-[140px] tw-justify-end tw-items-center tw-cursor-pointer choose-button disabled-select-button"
                                            }
                                        >
                                            <span>Submit</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </PromptContext.Provider>
                    </Box>
                </>
            </Modal>
        </ThemeProvider>
    );
};

export default AgentFormInputModal;
