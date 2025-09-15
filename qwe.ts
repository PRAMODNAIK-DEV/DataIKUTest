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
  const [dynamicFieldsData, setDynamicFieldsData] = useState<{ [key: string]: any; }>({});
  const [formData2, setFormData2] = useState<any>({});
  const [keyName, setKeyName] = useState<string>("");
  const [formData, setFormData] = useState<any>({});

  const combinedProperties = useMemo(() => {
    return (localAgentDetail?.skills_config || []).reduce(
      (acc, skill) => ({
        ...acc,
        ...(skill.input_schema?.properties || {}),
      }),
      {}
    );
  }, [localAgentDetail]);

  const combinedRequired = useMemo(() => {
    return (localAgentDetail?.skills_config || []).reduce(
      (acc, skill) => [...acc, ...(skill.input_schema?.required || [])],
      []
    );
  }, [localAgentDetail]);

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
      const allFields = Object.values(localAgentDetail?.skills_config || []).flatMap(
        (skill: any) => Object.entries(skill.input_schema?.properties || {})
      );

      allFields.forEach(([key, value]: any) => {
        if (!browserFields.includes(key)) {
          if (key === "model" && localAgentDetail?.model) {
            initialState[key] = localAgentDetail.model;
          } else {
            initialState[key] =
              value.default === "None" ? "" : value.default || "";
          }
        }
      });
      setFormData(initialState);
      setFormData2({});
      setDynamicFieldsData({});
      handleAdditionalFieldsRef();
    }
  }, [resetFormTrigger, localAgentDetail?.agent_id]);

  useEffect(() => {
    handleAdditionalFieldsRef(); // Handle dynamic fields when modal opens
  }, [openAgent]);

  // Handlers and helper functions
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
    Object.entries(combinedProperties).forEach(([key, data]: any) => {
      if (data?.$ref || data?.anyOf?.[0]?.$ref) {
        const reference = data?.$ref || data?.anyOf?.[0]?.$ref;
        const referenceKeys = reference.replace("#/", "").split("/");

        localAgentDetail.skills_config?.forEach((loop: any) => {
          const def = loop.input_schema?.$defs?.[referenceKeys[1]];
          if (def) {
            const consensusFields = def?.properties;
            const requiredField = def?.required || [];

            if (!consensusFields || Object.keys(consensusFields).length === 0) {
              return;
            }

            const requiredFieldsData: any = {};
            const nonRequiredFieldsData: any = {};

            Object.entries(consensusFields).forEach(
              ([fieldKey, fieldValue]: any) => {
                const validType =
                  fieldValue?.type ||
                  fieldValue?.anyOf?.[0]?.type ||
                  fieldValue?.$ref;
                if (!validType || validType === "null") {
                  return;
                }

                if (
                  requiredField.includes(fieldKey) &&
                  !browserFields.includes(fieldKey)
                ) {
                  fieldValue["required"] = true;
                  requiredFieldsData[fieldKey] = fieldValue;
                } else if (!browserFields.includes(fieldKey)) {
                  nonRequiredFieldsData[fieldKey] = fieldValue;
                }
              }
            );

            setChildProperties((prevState) => ({
              ...prevState,
              [key]: {
                ...requiredFieldsData,
                ...nonRequiredFieldsData,
              },
            }));

            setDynamicFieldsData((prevState) => ({
              ...prevState,
              ...requiredFieldsData,
              ...nonRequiredFieldsData,
            }));
            setKeyName(key);
          }
        });
      }
    });
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

  const isSubmitDisabled = useMemo(() => {
    const allRequiredFields = combinedRequired.filter(
      (field) => !browserFields.includes(field)
    );

    const hasEmptyStaticRequired = allRequiredFields.some((field) => {
      const value = formData[field];
      const fieldData = combinedProperties[field];
      if (
        fieldData?.default === null ||
        fieldData?.anyOf?.[0]?.type === null
      ) {
        return false;
      }
      return (
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      );
    });

    if (hasEmptyStaticRequired) return true;

    const hasEmptyDynamicRequired = Object.entries(dynamicFieldsData).some(
      ([key, schema]) => {
        if (!schema?.required) return false;
        if (browserFields.includes(key)) return false;
        if (schema?.default === null || schema?.anyOf?.[0]?.type === null) return false;

        const value = formData?.[key] ?? formData?.query_params?.[key] ?? undefined;
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === "object" && value !== null)
          return Object.keys(value).length === 0;
        return value === undefined || value === "";
      }
    );

    return hasEmptyDynamicRequired;
  }, [
    combinedRequired,
    browserFields,
    formData,
    dynamicFieldsData,
    combinedProperties,
  ]);

  const renderSkillSections = () => {
    if (!localAgentDetail?.skills_config?.length) {
      return (
        <h5 className="error-message-container">{failedCondition}</h5>
      );
    }
    return localAgentDetail.skills_config.map((skill: any, skillIndex: number) => {
      const skillName = skill.skill_name || `Skill ${skillIndex + 1}`;
      const skillProperties = Object.entries(skill.input_schema?.properties || {});
      const skillRequired = skill.input_schema?.required || [];

      const requiredFields = skillProperties.filter(
        ([key]) => skillRequired.includes(key) && !browserFields.includes(key)
      );

      const otherFields = skillProperties.filter(
        ([key]) => !skillRequired.includes(key) && !browserFields.includes(key)
      );

      return (
        <div key={skillName} style={{ marginBottom: '20px' }}>
          <Typography variant="h6" className="skill-section-title">
            {skillName}
          </Typography>
          <Grid container spacing={2} className="skill-form-grid">
            {requiredFields.map(([fieldKey, widget]: any) => (
              <Grid
                item xs={12} md={6} sm={12} lg={6} xl={4}
                className="grid-padding"
                key={`${skillName}-${fieldKey}`}
              >
                <CommonComponents
                  fieldKey={fieldKey}
                  datavlaue={widget}
                  handleInputChange={handleInputChange}
                  formData={formData}
                  agentDetail={localAgentDetail}
                  browserFields={browserFields}
                  isRequiredField={true}
                  chipData={chipData}
                />
              </Grid>
            ))}
            {Object.keys(dynamicFieldsData).length > 0 &&
              renderDynamicFields()}
            {otherFields
              .sort(([keyA]: any, [keyB]: any) => keyA.localeCompare(keyB))
              .map(([fieldKey, widget]: any) => (
                <Grid
                  item xs={12} md={6} sm={12} lg={6} xl={4}
                  className="grid-padding"
                  key={`${skillName}-${fieldKey}`}
                >
                  <CommonComponents
                    fieldKey={fieldKey}
                    datavlaue={widget}
                    handleInputChange={handleInputChange}
                    formData={formData}
                    agentDetail={localAgentDetail}
                    browserFields={browserFields}
                    isRequiredField={false}
                    chipData={chipData}
                  />
                </Grid>
              ))}
            {showComplexFields &&
              otherFields.filter(
                ([, value]: any) =>
                  value?.type === "object" ||
                  value?.anyOf?.[0]?.type === "object" ||
                  value?.type === "array" ||
                  value?.anyOf?.[0]?.type === "array" ||
                  value?.type === "list" ||
                  value?.anyOf?.[0]?.type === "list"
              ).map(([fieldKey, widget]: any) => (
                <Grid
                  item xs={12} md={6} sm={12} lg={6} xl={4}
                  className="grid-padding"
                  key={`${skillName}-${fieldKey}-complex`}
                >
                  <CommonComponents
                    fieldKey={fieldKey}
                    datavlaue={widget}
                    handleInputChange={handleInputChange}
                    formData={formData}
                    agentDetail={localAgentDetail}
                    browserFields={browserFields}
                    chipData={chipData}
                  />
                </Grid>
              ))}
          </Grid>
        </div>
      );
    });
  };

  const renderDynamicFields = () => {
    return Object.entries(dynamicFieldsData).map(([fieldKey, fieldData]) => (
      <Grid item xs={12} md={6} sm={12} lg={6} xl={4} key={fieldKey}>
        <CommonComponents
          fieldKey={fieldKey}
          datavlaue={fieldData}
          formData={formData2}
          handleInputChange={(fieldKey, value) =>
            handleDynamicFieldChange(fieldKey, value, keyName)
          }
          agentDetail={localAgentDetail}
          browserFields={browserFields}
          isRequiredField={fieldData?.required || false}
          chipData={chipData}
        />
      </Grid>
    ));
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